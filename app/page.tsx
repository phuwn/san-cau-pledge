"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Banknote, CalendarDays, Check, CheckCircle2, ChevronLeft, Copy, Loader2, QrCode, ShieldCheck, Sparkles, Users, WalletCards } from "lucide-react";

type Plan = "full" | "flex" | "dropin";
type Step = "vote" | "payment" | "done";
type Pledge = { id: string; reference: string; name: string; plan: Plan; selectedDates: string[]; amount: number; status: "pending" | "reported" | "confirmed" };
type Stats = { totalPledges: number; reportedPayments: number; totalCommitted: number; dates: Record<string, number>; recent: Array<{ name: string; plan: Plan; seatCount: number }> };

const DATES = [
  { value: "2026-11-01", day: "01" }, { value: "2026-11-08", day: "08" },
  { value: "2026-11-15", day: "15" }, { value: "2026-11-22", day: "22" },
  { value: "2026-11-29", day: "29" },
];
const PLANS = [
  { id: "full" as Plan, name: "Trụ tháng", price: 325_000, detail: "Giữ chỗ cả 5 Chủ nhật · 65k/buổi", badge: "Tiết kiệm nhất" },
  { id: "flex" as Plan, name: "Trụ bán phần", price: 135_000, detail: "Chọn trước 2 Chủ nhật · 67,5k/buổi", badge: "Linh hoạt" },
  { id: "dropin" as Plan, name: "Vãng lai", price: 75_000, detail: "Chọn 1 Chủ nhật · 75k/buổi" },
];
const PAYMENT = { configured: false, bank: "Ngân hàng sẽ được cấu hình" };
const EMPTY: Stats = { totalPledges: 0, reportedPayments: 0, totalCommitted: 0, dates: Object.fromEntries(DATES.map(d => [d.value, 0])), recent: [] };
const money = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + "đ";
const planLabel = (plan: Plan) => PLANS.find(p => p.id === plan)?.name ?? plan;

function MockQr({ reference, amount }: { reference: string; amount: number }) {
  const seed = `${reference}-${amount}`;
  const cells = Array.from({ length: 225 }, (_, index) => {
    const row = Math.floor(index / 15), col = index % 15;
    const finder = (row < 5 && col < 5) || (row < 5 && col > 9) || (row > 9 && col < 5);
    return finder || (seed.charCodeAt(index % seed.length) * (index + 7)) % 11 < 5;
  });
  return <div className="relative mx-auto aspect-square w-52 overflow-hidden rounded-3xl border-8 border-white bg-white p-2 shadow-[0_18px_60px_rgba(23,54,43,.16)]">
    <div className="grid h-full grid-cols-[repeat(15,1fr)] gap-[2px] rounded-xl bg-white p-1">{cells.map((on, i) => <span key={i} className={on ? "rounded-[1px] bg-[#17362b]" : "bg-transparent"} />)}</div>
    <div className="absolute inset-0 grid place-items-center"><span className="grid h-11 w-11 place-items-center rounded-2xl border-4 border-white bg-[#d8ff57]"><QrCode className="h-5 w-5" /></span></div>
  </div>;
}

export default function Home() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [step, setStep] = useState<Step>("vote");
  const [plan, setPlan] = useState<Plan>("full");
  const [dates, setDates] = useState<string[]>(DATES.map(d => d.value));
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [pledge, setPledge] = useState<Pledge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const selectedPlan = useMemo(() => PLANS.find(p => p.id === plan) ?? PLANS[0], [plan]);
  const average = Math.round(Object.values(stats.dates).reduce((a, b) => a + b, 0) / DATES.length);

  async function loadStats() {
    try { const r = await fetch("/api/pledges", { cache: "no-store" }); if (r.ok) setStats(((await r.json()) as { stats: Stats }).stats); } catch { /* preview can warm up */ }
  }
  useEffect(() => { void loadStats(); }, []);

  function choosePlan(next: Plan) { setPlan(next); setDates(next === "full" ? DATES.map(d => d.value) : []); setError(""); }
  function toggleDate(value: string) {
    if (plan === "full") return;
    const max = plan === "flex" ? 2 : 1;
    setDates(current => current.includes(value) ? current.filter(d => d !== value) : current.length >= max ? [...current.slice(1), value] : [...current, value]);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const required = plan === "full" ? DATES.length : plan === "flex" ? 2 : 1;
    if (name.trim().length < 2) return setError("Nhập tên của bạn để giữ chỗ nhé.");
    if (dates.length !== required) return setError(`Gói này cần chọn đúng ${required} ngày.`);
    setLoading(true);
    try {
      const r = await fetch("/api/pledges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, contact, plan, selectedDates: dates }) });
      const data = await r.json() as { pledge?: Pledge; error?: string };
      if (!r.ok || !data.pledge) throw new Error(data.error || "Chưa thể tạo pledge.");
      setPledge(data.pledge); localStorage.setItem("badminton-pledge", JSON.stringify(data.pledge)); setStep("payment"); await loadStats();
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
        <h1 className="font-display text-[clamp(3rem,7vw,6.2rem)] font-black leading-[.9] tracking-[-.06em]">Vote ngày.<br /><span className="text-[#28745a]">Giữ sân.</span> Ra cầu.</h1>
        <p className="mt-7 max-w-xl text-base leading-7 text-[#4c665b] sm:text-lg">Chọn gói phù hợp, thanh toán một lần và biết chắc Chủ nhật nào mình có sân. Giá trụ chỉ dành cho người cam kết sớm.</p>
        <div className="mt-9 grid max-w-xl grid-cols-3 gap-3">
          {[{ n: `${average}/12`, t: "Bình quân/buổi" }, { n: stats.totalPledges, t: "Người đã vote" }, { n: stats.reportedPayments, t: "Đã báo chuyển" }].map(item => <div key={item.t} className="rounded-2xl border border-[#c8d4c7] bg-white/75 p-4"><p className="text-2xl font-black">{item.n}</p><p className="mt-1 text-xs font-semibold text-[#6b7f74]">{item.t}</p></div>)}
        </div>
        <div className="mt-8 max-w-xl rounded-3xl bg-[#17362b] p-5 text-white shadow-[0_22px_70px_rgba(23,54,43,.18)] sm:p-6">
          <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-bold">Tiến độ từng Chủ nhật</p><p className="mt-1 text-xs text-white/60">Mục tiêu 12 người để mở 2 sân</p></div><Users className="h-5 w-5 text-[#d8ff57]" /></div>
          <div className="grid grid-cols-5 gap-2">{DATES.map(date => { const count = stats.dates[date.value] ?? 0; return <div key={date.value} className="rounded-2xl bg-white/8 p-2.5 text-center"><p className="text-[10px] font-bold text-white/55">CN</p><p className="mt-0.5 text-lg font-black">{date.day}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#d8ff57]" style={{ width: `${Math.min(100, count / 12 * 100)}%` }} /></div><p className="mt-2 text-[10px] font-bold text-white/70">{count}/12</p></div>; })}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[32px] border border-[#c8d4c7] bg-white shadow-[0_28px_100px_rgba(23,54,43,.13)]">
        {step === "vote" && <form onSubmit={submit} className="p-5 sm:p-8">
          <div className="mb-7 flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#28745a]">Bước 1/2</p><h2 className="font-display mt-2 text-3xl font-black tracking-tight">Chọn lời hứa ra sân</h2></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eef4df]"><CalendarDays className="h-5 w-5" /></span></div>
          <div className="space-y-2.5">{PLANS.map(item => { const active = item.id === plan; return <button type="button" key={item.id} onClick={() => choosePlan(item.id)} className={`w-full rounded-2xl border p-4 text-left transition ${active ? "border-[#28745a] bg-[#edf7ef] shadow-[0_0_0_2px_rgba(40,116,90,.12)]" : "border-[#d7dfd5] hover:border-[#9fb0a2]"}`}><div className="flex items-center gap-3"><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${active ? "border-[#28745a] bg-[#28745a] text-white" : "border-[#aebcaf]"}`}>{active && <Check className="h-3.5 w-3.5" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{item.name}</p>{item.badge && <span className="rounded-full bg-[#d8ff57] px-2 py-0.5 text-[10px] font-black">{item.badge}</span>}</div><p className="mt-1 text-xs text-[#6b7f74]">{item.detail}</p></div><p className="font-display text-lg font-black">{money(item.price)}</p></div></button>; })}</div>
          <div className="mt-6"><div className="mb-3 flex justify-between"><label className="text-sm font-black">Chọn ngày chơi</label><span className="text-xs font-semibold text-[#6b7f74]">{plan === "full" ? "Đã chọn toàn bộ" : `${dates.length}/${plan === "flex" ? 2 : 1} ngày`}</span></div><div className="grid grid-cols-5 gap-2">{DATES.map(date => <button type="button" key={date.value} onClick={() => toggleDate(date.value)} disabled={plan === "full"} className={`rounded-2xl border px-1 py-3 text-center ${dates.includes(date.value) ? "border-[#17362b] bg-[#17362b] text-white" : "border-[#d7dfd5] text-[#557064]"}`}><span className="block text-[10px] font-bold opacity-60">CN</span><span className="block text-lg font-black">{date.day}</span></button>)}</div></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-black uppercase tracking-wider text-[#557064]">Tên của bạn</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Phương" className="h-12 w-full rounded-2xl border border-[#d7dfd5] bg-[#fbfcf7] px-4 text-sm font-semibold outline-none focus:border-[#28745a] focus:ring-4 focus:ring-[#28745a]/10" /></label><label><span className="mb-2 block text-xs font-black uppercase tracking-wider text-[#557064]">Zalo / SĐT</span><input value={contact} onChange={e => setContact(e.target.value)} placeholder="Không bắt buộc" className="h-12 w-full rounded-2xl border border-[#d7dfd5] bg-[#fbfcf7] px-4 text-sm font-semibold outline-none focus:border-[#28745a] focus:ring-4 focus:ring-[#28745a]/10" /></label></div>
          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <button disabled={loading} className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#17362b] px-5 text-sm font-black text-white hover:bg-[#214a3b] disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <WalletCards className="h-5 w-5" />} Vote & tạo mã thanh toán · {money(selectedPlan.price)} {!loading && <ArrowRight className="h-4 w-4" />}</button>
          <p className="mt-4 flex items-center justify-center gap-2 text-[11px] font-semibold text-[#76877e]"><ShieldCheck className="h-3.5 w-3.5" /> Suất có thể chuyển cho bạn bè nếu bạn bận</p>
        </form>}

        {step === "payment" && pledge && <div className="p-5 sm:p-8">
          <button onClick={() => setStep("vote")} className="mb-6 flex items-center gap-1 text-xs font-bold text-[#557064]"><ChevronLeft className="h-4 w-4" /> Quay lại</button>
          <div className="text-center"><p className="text-xs font-black uppercase tracking-[.16em] text-[#28745a]">Bước 2/2</p><h2 className="font-display mt-2 text-3xl font-black">Quét QR để chốt suất</h2><p className="mt-2 text-sm text-[#6b7f74]">{planLabel(pledge.plan)} · {pledge.selectedDates.length} buổi</p></div>
          {!PAYMENT.configured && <div className="mx-auto mt-5 max-w-sm rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-bold text-amber-800">Bản preview — QR ngân hàng sẽ hoạt động sau khi cấu hình tài khoản nhận tiền.</div>}
          <div className="mt-6"><MockQr reference={pledge.reference} amount={pledge.amount} /></div>
          <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-[#d7dfd5] bg-[#fbfcf7] p-4"><div className="flex justify-between text-sm"><span className="text-[#6b7f74]">Số tiền</span><strong>{money(pledge.amount)}</strong></div><div className="mt-3 flex justify-between text-sm"><span className="text-[#6b7f74]">Nội dung</span><button onClick={copyReference} className="flex items-center gap-1.5 font-black text-[#28745a]">{pledge.reference} {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button></div><div className="mt-3 flex justify-between text-sm"><span className="text-[#6b7f74]">Ngân hàng</span><strong>{PAYMENT.bank}</strong></div></div>
          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <button onClick={reportPayment} disabled={loading} className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#d8ff57] px-5 text-sm font-black hover:bg-[#ccf04f] disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Banknote className="h-5 w-5" />} {PAYMENT.configured ? "Tôi đã chuyển khoản" : "Đánh dấu đã chuyển (demo)"}</button>
        </div>}

        {step === "done" && pledge && <div className="p-8 text-center sm:p-12"><span className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-[#d8ff57]"><CheckCircle2 className="h-10 w-10" /></span><p className="mt-7 text-xs font-black uppercase tracking-[.16em] text-[#28745a]">Đã ghi nhận</p><h2 className="font-display mt-2 text-4xl font-black">Hẹn bạn trên sân!</h2><p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[#6b7f74]">Pledge <strong className="text-[#17362b]">{pledge.reference}</strong> đang chờ BTC đối soát.</p><div className="mt-7 rounded-2xl bg-[#f2f5ea] p-5 text-left"><div className="flex justify-between text-sm"><span>Gói</span><strong>{planLabel(pledge.plan)}</strong></div><div className="mt-3 flex justify-between text-sm"><span>Số buổi</span><strong>{pledge.selectedDates.length}</strong></div><div className="mt-3 flex justify-between text-sm"><span>Đã chuyển</span><strong>{money(pledge.amount)}</strong></div></div><button onClick={() => { setStep("vote"); setPledge(null); setName(""); setContact(""); choosePlan("full"); }} className="mt-7 text-sm font-black text-[#28745a] underline decoration-2 underline-offset-4">Tạo pledge khác</button></div>}
      </div>
    </section>

    <section className="relative border-t border-[#d5ddd1] bg-[#edf0e5]"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:px-12"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#28745a]">Sổ pledge công khai</p><h2 className="font-display mt-3 text-3xl font-black">Mỗi lời hứa làm sân cầu chắc hơn.</h2><p className="mt-4 max-w-md text-sm leading-6 text-[#63776d]">Tên được rút gọn để giữ riêng tư. Số điện thoại và thông tin thanh toán không hiển thị ở đây.</p></div><div className="grid gap-3 sm:grid-cols-2">{stats.recent.length === 0 ? <div className="col-span-full rounded-3xl border border-dashed border-[#b8c4b8] bg-white/45 p-8 text-center text-sm font-semibold text-[#6b7f74]">Chưa có pledge nào. Bạn sẽ là người mở hàng chứ?</div> : stats.recent.map((item, i) => <div key={`${item.name}-${i}`} className="flex items-center gap-3 rounded-2xl border border-[#d2dbcf] bg-white/70 p-4"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#17362b] text-sm font-black text-[#d8ff57]">{item.name[0]?.toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{item.name}</p><p className="mt-0.5 text-xs font-semibold text-[#6b7f74]">{planLabel(item.plan)} · {item.seatCount} buổi</p></div><CheckCircle2 className="h-4 w-4 text-[#28745a]" /></div>)}</div></div></section>
  </main>;
}
