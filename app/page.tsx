"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Banknote, CalendarDays, Check, CheckCircle2, ChevronLeft, Copy, Loader2, QrCode, ShieldCheck, Sparkles, Users, WalletCards } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { courtPlan, planName, quoteSelection, SESSION_DATES, type Plan } from "../lib/pledge-config";

type Step = "vote" | "payment" | "done";
type Pledge = { id: string; reference: string; name: string; plan: Plan; selectedDates: string[]; amount: number; status: "pending" | "reported" | "confirmed" };
type Participant = { name: string; plan: Plan };
type Stats = { totalPledges: number; reportedPayments: number; totalCommitted: number; dates: Record<string, number>; participants: Record<string, Participant[]>; recent: Array<{ name: string; plan: Plan; seatCount: number }> };
type CheckoutResponse = { checkoutUrl?: string; fields?: Record<string, string | number>; error?: string };

const DATES = SESSION_DATES;
const EMPTY: Stats = { totalPledges: 0, reportedPayments: 0, totalCommitted: 0, dates: Object.fromEntries(DATES.map(d => [d.value, 0])), participants: Object.fromEntries(DATES.map(d => [d.value, []])), recent: [] };
const money = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + "đ";
const planLabel = (plan: Plan) => planName(plan);

export default function Home() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [step, setStep] = useState<Step>("vote");
  const [dates, setDates] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [pledge, setPledge] = useState<Pledge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedRosterDate, setSelectedRosterDate] = useState<string | null>(null);
  const selection = useMemo(() => quoteSelection(dates.length), [dates.length]);
  const totalBookedSlots = Object.values(stats.dates).reduce((sum, count) => sum + count, 0);
  const selectedRosterDay = DATES.find(date => date.value === selectedRosterDate);
  const selectedRoster = selectedRosterDate ? (stats.participants[selectedRosterDate] ?? []) : [];

  async function loadStats() {
    try { const r = await fetch("/api/pledges", { cache: "no-store" }); if (r.ok) setStats(((await r.json()) as { stats: Stats }).stats); } catch { /* preview can warm up */ }
  }
  useEffect(() => {
    let active = true;
    fetch("/api/pledges", { cache: "no-store" })
      .then(async response => response.ok ? (await response.json() as { stats: Stats }).stats : null)
      .then(nextStats => { if (active && nextStats) setStats(nextStats); })
      .catch(() => { /* the database can still be warming up */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentResult = params.get("payment");
    const pledgeId = params.get("pledge");
    if (!paymentResult || !pledgeId) return;

    const stored = localStorage.getItem("badminton-pledge");
    const cached = stored ? JSON.parse(stored) as Pledge : null;
    queueMicrotask(() => {
      if (cached?.id === pledgeId) setPledge(cached);
      setStep("payment");
    });

    if (paymentResult === "cancel") {
      queueMicrotask(() => setError("Bạn đã hủy thanh toán. Có thể mở lại VietQR khi sẵn sàng."));
      return;
    }
    if (paymentResult === "error") {
      queueMicrotask(() => setError("SePay chưa hoàn tất được giao dịch. Hãy thử lại hoặc liên hệ BTC."));
      return;
    }

    let active = true;
    let attempts = 0;
    async function pollPayment() {
      if (!active) return;
      try {
        const response = await fetch(`/api/pledges?id=${encodeURIComponent(pledgeId!)}`, { cache: "no-store" });
        const data = await response.json() as { pledge?: Pledge };
        if (data.pledge) {
          const next = { ...(cached ?? data.pledge), ...data.pledge };
          setPledge(next);
          localStorage.setItem("badminton-pledge", JSON.stringify(next));
          if (data.pledge.status === "confirmed") {
            setStep("done");
            setError("");
            window.history.replaceState({}, "", window.location.pathname);
            await loadStats();
            return;
          }
        }
      } catch { /* SePay can redirect before the IPN has arrived */ }
      attempts += 1;
      if (active && attempts < 12) window.setTimeout(pollPayment, 1500);
      else if (active) setError("Đã nhận kết quả từ SePay nhưng đang chờ IPN xác nhận. Trang sẽ tự cập nhật khi giao dịch được đối soát.");
    }
    void pollPayment();
    return () => { active = false; };
  }, []);

  function toggleDate(value: string) {
    setDates(current => current.includes(value) ? current.filter(date => date !== value) : [...current, value]);
    setError("");
  }
  async function startCheckout(nextPledge: Pledge) {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/sepay/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pledgeId: nextPledge.id }),
      });
      const data = await response.json() as CheckoutResponse;
      if (!response.ok || !data.checkoutUrl || !data.fields) throw new Error(data.error || "Chưa thể mở cổng thanh toán SePay.");

      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.checkoutUrl;
      for (const [field, value] of Object.entries(data.fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = field;
        input.value = String(value);
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Chưa thể mở cổng thanh toán SePay.");
      setLoading(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (name.trim().length < 2) return setError("Nhập tên của bạn để giữ chỗ nhé.");
    if (!selection) return setError("Hãy chọn ít nhất một Chủ nhật để giữ chỗ.");
    setLoading(true);
    try {
      const r = await fetch("/api/pledges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, contact, selectedDates: dates }) });
      const data = await r.json() as { pledge?: Pledge; error?: string };
      if (!r.ok || !data.pledge) throw new Error(data.error || "Chưa thể tạo pledge.");
      setPledge(data.pledge); localStorage.setItem("badminton-pledge", JSON.stringify(data.pledge)); setStep("payment"); await loadStats(); await startCheckout(data.pledge);
    } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi xảy ra."); } finally { setLoading(false); }
  }
  async function reportPayment() {
    if (!pledge) return; setLoading(true); setError("");
    try {
      const r = await fetch("/api/pledges", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: pledge.id, action: "report_payment" }) });
      if (!r.ok) throw new Error("Chưa ghi nhận được thanh toán.");
      const next = { ...pledge, status: "reported" as const }; setPledge(next); localStorage.setItem("badminton-pledge", JSON.stringify(next)); setStep("done"); await loadStats();
    } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi xảy ra."); } finally { setLoading(false); }
  }
  async function copyReference() { if (!pledge) return; await navigator.clipboard.writeText(pledge.reference); setCopied(true); setTimeout(() => setCopied(false), 1400); }

  return <main className="min-h-screen overflow-hidden bg-[#f7f8ee] text-[#17362b]">
    <div className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_82%_16%,rgba(216,255,87,.55),transparent_28%),radial-gradient(circle_at_18%_2%,rgba(163,221,196,.46),transparent_31%)]" />
    <header className="relative mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-12">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#17362b] text-xl text-[#d8ff57]">🏸</div><div><p className="font-display text-lg font-bold leading-none">Sân Cầu</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-[.18em] text-[#557064]">Sunday Club</p></div></div>
      <div className="rounded-full border border-[#b9c8bd] bg-white/70 px-4 py-2 text-xs font-bold backdrop-blur">Pledge tháng 11</div>
    </header>

    <section className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-8 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:px-12 lg:pb-24 lg:pt-14">
      <div className="max-w-2xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#a7b8aa] bg-white/70 px-3 py-1.5 text-xs font-bold"><Sparkles className="h-3.5 w-3.5" /> Cùng chốt sân trước, chơi thảnh thơi sau</div>
        <h1 className="font-display text-[clamp(3rem,7vw,6.2rem)] font-black leading-[.98] tracking-[-.045em]">Vote ngày.<br /><span className="text-[#28745a]">Giữ sân.</span> Ra cầu.</h1>
        <p className="mt-7 max-w-xl text-base leading-7 text-[#4c665b] sm:text-lg">Chọn bất kỳ Chủ nhật nào bạn muốn chơi. Chọn đủ cả tháng, hệ thống tự chuyển thành Trụ tháng với mức giá tốt nhất.</p>
        <div className="mt-9 grid max-w-xl grid-cols-2 gap-3">
          {[{ n: totalBookedSlots, t: "Suất đã chốt" }, { n: stats.reportedPayments, t: "Người đã chốt" }].map(item => <div key={item.t} className="rounded-2xl border border-[#c8d4c7] bg-white/75 p-4"><p className="text-2xl font-black">{item.n}</p><p className="mt-1 text-xs font-semibold text-[#6b7f74]">{item.t}</p></div>)}
        </div>
        <div className="mt-8 max-w-xl rounded-3xl bg-[#17362b] p-5 text-white shadow-[0_22px_70px_rgba(23,54,43,.18)] sm:p-6">
          <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-bold">Sân cứng theo từng Chủ nhật</p><p className="mt-1 text-xs text-white/60">Mỗi 6 suất trả trước khóa 1 sân · tối đa 8 người/sân</p></div><Users className="h-5 w-5 text-[#d8ff57]" /></div>
          <div className="grid grid-cols-5 gap-2">{DATES.map(date => {
            const count = stats.dates[date.value] ?? 0;
            const court = courtPlan(count);
            const note = court.courts === 0
              ? `${court.slotsToNextCourt} suất nữa`
              : court.overflow > 0
                ? `${court.slotsToNextCourt} suất mở sân ${court.courts + 1}`
                : `${Math.max(0, court.capacity - count)} chỗ còn lại`;
            return <button type="button" key={date.value} onClick={() => setSelectedRosterDate(date.value)} aria-label={`Xem người tham gia Chủ nhật ${date.day}`} className="rounded-2xl bg-white/8 p-2.5 text-center transition hover:-translate-y-0.5 hover:bg-white/13 focus:outline-none focus:ring-2 focus:ring-[#d8ff57]"><p className="text-[10px] font-bold text-white/55">CN</p><p className="mt-0.5 text-lg font-black">{date.day}</p><p className="mt-2 text-sm font-black text-[#d8ff57]">{court.courts} sân</p><p className="mt-1 text-[10px] font-bold text-white/75">{count} suất chốt</p><p className="mt-1 min-h-7 text-[9px] leading-3 text-white/50">{note}</p><p className="mt-1 text-[8px] font-bold uppercase tracking-wide text-[#d8ff57]/65">Xem người chơi</p></button>;
          })}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[32px] border border-[#c8d4c7] bg-white shadow-[0_28px_100px_rgba(23,54,43,.13)]">
        {step === "vote" && <form onSubmit={submit} className="p-5 sm:p-8">
          <div className="mb-7 flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#28745a]">Bước 1/2</p><h2 className="font-display mt-2 text-3xl font-black tracking-tight">Chọn lời hứa ra sân</h2></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eef4df]"><CalendarDays className="h-5 w-5" /></span></div>
          <div className="rounded-2xl border border-[#d7dfd5] bg-[#fbfcf7] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black">Lịch linh hoạt</p><span className="rounded-full bg-[#eef4df] px-2.5 py-1 text-[10px] font-black text-[#28745a]">Chọn bao nhiêu buổi tùy bạn</span></div><p className="mt-2 text-xs leading-5 text-[#6b7f74]">1 buổi 75k · 2–4 buổi 67,5k/buổi · chọn đủ tháng tự động thành Trụ tháng 65k/buổi.</p></div>
          <div className="mt-6"><div className="mb-3 flex justify-between"><label className="text-sm font-black">Chọn ngày chơi</label><span className="text-xs font-semibold text-[#6b7f74]">{dates.length === DATES.length ? "Đã chọn toàn bộ" : `${dates.length}/${DATES.length} ngày`}</span></div><div className="grid grid-cols-5 gap-2">{DATES.map(date => <button type="button" key={date.value} onClick={() => toggleDate(date.value)} aria-pressed={dates.includes(date.value)} className={`rounded-2xl border px-1 py-3 text-center transition ${dates.includes(date.value) ? "border-[#17362b] bg-[#17362b] text-white shadow-[0_8px_24px_rgba(23,54,43,.16)]" : "border-[#d7dfd5] text-[#557064] hover:border-[#9fb0a2]"}`}><span className="block text-[10px] font-bold opacity-60">CN</span><span className="block text-lg font-black">{date.day}</span></button>)}</div></div>
          <div className={`mt-4 rounded-2xl border p-4 transition ${selection ? "border-[#28745a] bg-[#edf7ef]" : "border-dashed border-[#c8d4c7] bg-white"}`}>
            {selection ? <div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#28745a] text-white"><Check className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black">{selection.name}</p><span className="rounded-full bg-[#d8ff57] px-2 py-0.5 text-[10px] font-black">{selection.badge}</span></div><p className="mt-1 text-xs text-[#6b7f74]">{money(selection.pricePerSession)}/buổi · {dates.length} Chủ nhật</p></div><p className="font-display text-lg font-black">{money(selection.amount)}</p></div> : <p className="text-center text-sm font-semibold text-[#6b7f74]">Chọn ít nhất 1 ngày để xem mức giá</p>}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-black uppercase tracking-wider text-[#557064]">Tên của bạn</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Phương" className="h-12 w-full rounded-2xl border border-[#d7dfd5] bg-[#fbfcf7] px-4 text-sm font-semibold outline-none focus:border-[#28745a] focus:ring-4 focus:ring-[#28745a]/10" /></label><label><span className="mb-2 block text-xs font-black uppercase tracking-wider text-[#557064]">Zalo / SĐT</span><input value={contact} onChange={e => setContact(e.target.value)} placeholder="Không bắt buộc" className="h-12 w-full rounded-2xl border border-[#d7dfd5] bg-[#fbfcf7] px-4 text-sm font-semibold outline-none focus:border-[#28745a] focus:ring-4 focus:ring-[#28745a]/10" /></label></div>
          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <button disabled={loading || !selection} className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#17362b] px-5 text-sm font-black text-white hover:bg-[#214a3b] disabled:cursor-not-allowed disabled:opacity-45">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <WalletCards className="h-5 w-5" />} {selection ? `Vote & tạo mã thanh toán · ${money(selection.amount)}` : "Chọn ngày để tiếp tục"} {!loading && selection && <ArrowRight className="h-4 w-4" />}</button>
          <div className="mt-5 rounded-2xl bg-[#f2f5ea] p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-[#557064]">Sau khi bạn chốt</p><div className="mt-3 grid gap-3 sm:grid-cols-3">{[
            { icon: ShieldCheck, title: "Giữ suất", detail: "Suất được tính ngay khi thanh toán xác nhận." },
            { icon: Users, title: "Khóa sân", detail: "Mỗi 6 suất chốt tạo đủ quỹ cho 1 sân cứng." },
            { icon: CheckCircle2, title: "Bận vẫn ổn", detail: "Có thể chuyển suất cho bạn bè nếu đổi lịch." },
          ].map(item => <div key={item.title} className="flex gap-2.5 sm:block"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-[#28745a]"><item.icon className="h-4 w-4" /></span><div><p className="text-xs font-black sm:mt-2">{item.title}</p><p className="mt-0.5 text-[10px] leading-4 text-[#6b7f74]">{item.detail}</p></div></div>)}</div></div>
        </form>}

        {step === "payment" && pledge && <div className="p-5 sm:p-8">
          <button onClick={() => setStep("vote")} className="mb-6 flex items-center gap-1 text-xs font-bold text-[#557064]"><ChevronLeft className="h-4 w-4" /> Quay lại</button>
          <div className="text-center"><p className="text-xs font-black uppercase tracking-[.16em] text-[#28745a]">Bước 2/2</p><h2 className="font-display mt-2 text-3xl font-black">Quét QR để chốt suất</h2><p className="mt-2 text-sm text-[#6b7f74]">{planLabel(pledge.plan)} · {pledge.selectedDates.length} buổi</p></div>
          <div className="mx-auto mt-6 grid aspect-square w-52 place-items-center rounded-3xl border-8 border-white bg-[#17362b] text-white shadow-[0_18px_60px_rgba(23,54,43,.16)]"><div className="px-5 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#d8ff57] text-[#17362b]"><QrCode className="h-8 w-8" /></span><p className="mt-4 text-sm font-black">VietQR qua SePay</p><p className="mt-1 text-[11px] leading-4 text-white/65">Mã QR được tạo trên trang thanh toán bảo mật</p></div></div>
          <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-[#d7dfd5] bg-[#fbfcf7] p-4"><div className="flex justify-between text-sm"><span className="text-[#6b7f74]">Số tiền</span><strong>{money(pledge.amount)}</strong></div><div className="mt-3 flex justify-between text-sm"><span className="text-[#6b7f74]">Mã đơn</span><button onClick={copyReference} className="flex items-center gap-1.5 font-black text-[#28745a]">{pledge.reference} {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button></div><div className="mt-3 flex justify-between text-sm"><span className="text-[#6b7f74]">Đối soát</span><strong>Tự động qua IPN</strong></div></div>
          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <button onClick={() => startCheckout(pledge)} disabled={loading} className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#d8ff57] px-5 text-sm font-black hover:bg-[#ccf04f] disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />} Mở mã VietQR trên SePay</button>
          <button onClick={reportPayment} disabled={loading} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#d7dfd5] px-5 text-xs font-bold text-[#557064] hover:bg-[#f4f6ee] disabled:opacity-60"><Banknote className="h-4 w-4" /> Báo đã chuyển nếu chưa tự xác nhận</button>
        </div>}

        {step === "done" && pledge && <div className="p-8 text-center sm:p-12"><span className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-[#d8ff57]"><CheckCircle2 className="h-10 w-10" /></span><p className="mt-7 text-xs font-black uppercase tracking-[.16em] text-[#28745a]">Thanh toán đã xác nhận</p><h2 className="font-display mt-2 text-4xl font-black">Hẹn bạn trên sân!</h2><p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[#6b7f74]">Pledge <strong className="text-[#17362b]">{pledge.reference}</strong> đã được SePay đối soát tự động.</p><div className="mt-7 rounded-2xl bg-[#f2f5ea] p-5 text-left"><div className="flex justify-between text-sm"><span>Gói</span><strong>{planLabel(pledge.plan)}</strong></div><div className="mt-3 flex justify-between text-sm"><span>Số buổi</span><strong>{pledge.selectedDates.length}</strong></div><div className="mt-3 flex justify-between text-sm"><span>Đã chuyển</span><strong>{money(pledge.amount)}</strong></div></div><button onClick={() => { setStep("vote"); setPledge(null); setName(""); setContact(""); setDates([]); }} className="mt-7 text-sm font-black text-[#28745a] underline decoration-2 underline-offset-4">Tạo pledge khác</button></div>}
      </div>
    </section>

    <section className="relative border-t border-[#d5ddd1] bg-[#edf0e5]"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:px-12"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#28745a]">Sổ pledge công khai</p><h2 className="font-display mt-3 text-3xl font-black">Mỗi lời hứa làm sân cầu chắc hơn.</h2><p className="mt-4 max-w-md text-sm leading-6 text-[#63776d]">Tên được rút gọn để giữ riêng tư. Số điện thoại và thông tin thanh toán không hiển thị ở đây.</p></div><div className="grid gap-3 sm:grid-cols-2">{stats.recent.length === 0 ? <div className="col-span-full rounded-3xl border border-dashed border-[#b8c4b8] bg-white/45 p-8 text-center text-sm font-semibold text-[#6b7f74]">Chưa có pledge nào. Bạn sẽ là người mở hàng chứ?</div> : stats.recent.map((item, i) => <div key={`${item.name}-${i}`} className="flex items-center gap-3 rounded-2xl border border-[#d2dbcf] bg-white/70 p-4"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#17362b] text-sm font-black text-[#d8ff57]">{item.name[0]?.toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{item.name}</p><p className="mt-0.5 text-xs font-semibold text-[#6b7f74]">{planLabel(item.plan)} · {item.seatCount} buổi</p></div><CheckCircle2 className="h-4 w-4 text-[#28745a]" /></div>)}</div></div></section>

    <Dialog open={Boolean(selectedRosterDate)} onOpenChange={open => { if (!open) setSelectedRosterDate(null); }}>
      <DialogContent className="overflow-hidden rounded-[28px] border-[#c8d4c7] bg-[#f7f8ee] p-0 [&_[data-slot=dialog-close]]:rounded-full [&_[data-slot=dialog-close]]:bg-white/10 [&_[data-slot=dialog-close]]:p-1.5 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:opacity-100 sm:max-w-md">
        <DialogHeader className="bg-[#17362b] p-6 pr-12 text-left text-white"><DialogTitle className="font-display text-2xl font-black">Chủ nhật {selectedRosterDay?.day}/11</DialogTitle><DialogDescription className="text-white/65">{selectedRoster.length} người đã thanh toán và chốt suất</DialogDescription></DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto p-5">{selectedRoster.length === 0 ? <div className="rounded-2xl border border-dashed border-[#b8c4b8] bg-white/60 p-7 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[#eef4df]"><Users className="h-5 w-5 text-[#28745a]" /></span><p className="mt-3 text-sm font-black">Chưa có ai chốt ngày này</p><p className="mt-1 text-xs leading-5 text-[#6b7f74]">Bạn có thể là người đầu tiên giúp mở sân.</p></div> : <div className="space-y-2">{selectedRoster.map((person, index) => <div key={`${person.name}-${index}`} className="flex items-center gap-3 rounded-2xl border border-[#d7dfd5] bg-white p-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#17362b] text-sm font-black text-[#d8ff57]">{person.name[0]?.toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{person.name}</p><p className="mt-0.5 text-xs font-semibold text-[#6b7f74]">{planLabel(person.plan)}</p></div><CheckCircle2 className="h-4 w-4 text-[#28745a]" /></div>)}</div>}<p className="mt-4 text-center text-[10px] font-semibold text-[#76877e]">Tên được rút gọn để bảo vệ riêng tư</p></div>
      </DialogContent>
    </Dialog>
  </main>;
}
