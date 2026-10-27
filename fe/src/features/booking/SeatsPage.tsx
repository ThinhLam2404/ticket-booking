import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiClientError, api } from "../../api";
import {
  Alert,
  EmptyState,
  ErrorState,
  LoadingState,
  NoticeDialog,
} from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { useCountdown } from "../../components/useCountdown";
import {
  errorMessage,
  formatDate,
  formatTime,
  money,
} from "../../utils/format";
import { couplePartnerNumber } from "../../utils/seat-layout";
import type { ShowtimeSeat } from "../../types";
import {
  BookingSteps,
  MiniPoster,
  SeatButton,
  seatTypeLabel,
} from "./components";
import { ComboPicker } from "./ComboPicker";

type ComboSelection = { cinemaComboId: string; quantity: number };
type AppliedVoucher = {
  code: string;
  quote: Awaited<ReturnType<typeof api.quote>>;
  seatIds: string[];
  combos: ComboSelection[];
};
type VoucherQuoteSelection = {
  seatIds: string[];
  combos: ComboSelection[];
  code: string;
};

const SHOWTIME_BUFFER_SECONDS = 5 * 60;

export function SeatsPage() {
  const { showtimeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, openAuth } = useAuth();
  const location = useLocation();
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [comboDraft, setComboDraft] = useState<
    Record<string, { quantity: number; price: number }>
  >({});
  const [voucherDraft, setVoucherDraft] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(null);
  const voucherQuoteSelection = useRef<VoucherQuoteSelection | null>(null);
  const [retryLocked, setRetryLocked] = useState(false);
  const [holdExpiredNotice, setHoldExpiredNotice] = useState(false);
  const [holdConflict, setHoldConflict] = useState<
    "HELD" | "UNAVAILABLE" | null
  >(null);
  const holdKey = useRef(`hold-${crypto.randomUUID()}`);
  const pendingPurchase = useRef<{ showtimeId: string; seats: string[]; key: string; combos: Array<{ cinemaComboId: string; quantity: number }>; voucherCode: string | null } | null>(null);
  const showtimeQuery = useQuery({
    queryKey: ["showtime", showtimeId],
    queryFn: ({ signal }) => api.showtime(showtimeId!, signal),
    enabled: Boolean(showtimeId),
  });
  const seatsQuery = useQuery({
    queryKey: ["showtime-seats", showtimeId],
    queryFn: ({ signal }) => api.showtimeSeats(showtimeId!, signal),
    enabled: Boolean(showtimeId),
    refetchInterval: 10000,
  });
  const showtimeCountdown = useCountdown(showtimeQuery.data?.startsAt);
  const comboMenu = useQuery({ queryKey: ['combo-menu', showtimeQuery.data?.room?.cinema?.id], queryFn: () => api.comboMenu(showtimeQuery.data!.room!.cinema!.id), enabled: Boolean(showtimeQuery.data?.room?.cinema?.id) });
  const hasComboSelection = Object.values(comboDraft).some((item) => item.quantity > 0);
  const comboSelections = Object.entries(comboDraft)
    .filter(([, item]) => item.quantity > 0)
    .map(([cinemaComboId, item]) => ({ cinemaComboId, quantity: item.quantity }));
  const quoteMutation = useMutation({
    mutationFn: () => {
      const code = voucherDraft.trim().toUpperCase();
      const seats = [...selectedSeats];
      const combos = comboSelections.map((combo) => ({ ...combo }));
      voucherQuoteSelection.current = { seatIds: seats, combos, code };
      return api.quote({
        showtimeId: showtimeId!,
        showtimeSeatIds: seats,
        combos,
        voucherCode: code || null,
      });
    },
    onSuccess: (quote) => {
      const request = voucherQuoteSelection.current;
      if (!request || request.code !== voucherDraft.trim().toUpperCase()
        || request.seatIds.join(',') !== selectedSeats.join(',')
        || JSON.stringify(request.combos) !== JSON.stringify(comboSelections)) {
        return;
      }
      setAppliedVoucher(request.code ? {
        code: request.code,
        quote,
        seatIds: request.seatIds,
        combos: request.combos,
      } : null);
    },
  });
  const invalidComboSelection = hasComboSelection && (!comboMenu.isSuccess || Object.entries(comboDraft).some(([id, item]) => item.quantity > 0 && !comboMenu.data.some((offer) => offer.id === id)));
  const holdMutation = useMutation({
    mutationFn: () => {
      const purchase = pendingPurchase.current!;
      return api.hold(purchase.showtimeId, purchase.seats, purchase.key, purchase.combos, purchase.voucherCode);
    },
    onSuccess: (booking) => {
      queryClient.setQueryData(["booking", booking.id], booking);
      void queryClient.invalidateQueries({
        queryKey: ["showtime-seats", showtimeId],
      });
      navigate(`/bookings/${booking.id}`);
    },
    onError: (cause) => {
      if (!(cause instanceof ApiClientError) || cause.statusCode === 0 || cause.statusCode >= 500 || (retryLocked && [408, 429, 401, 403].includes(cause.statusCode))) {
        setRetryLocked(true);
        return;
      }
      setRetryLocked(false);
      pendingPurchase.current = null;
      void seatsQuery.refetch();
      setSelectedSeats([]);
      holdKey.current = `hold-${crypto.randomUUID()}`;
      if (cause.code === "SEATS_HELD") setHoldConflict("HELD");
      else if (cause.code === "SEATS_UNAVAILABLE")
        setHoldConflict("UNAVAILABLE");
    },
  });

  useEffect(() => {
    holdKey.current = `hold-${crypto.randomUUID()}`;
    setSelectedSeats([]);
    setComboDraft({});
    setVoucherDraft('');
    setAppliedVoucher(null);
    setRetryLocked(false);
    pendingPurchase.current = null;
  }, [showtimeId]);
  useEffect(() => {
    if (!location.state?.holdExpired) return;
    setHoldExpiredNotice(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);
  useEffect(() => {
    if (!seatsQuery.data || retryLocked || holdMutation.isPending) return;
    const seatsById = new Map(
      seatsQuery.data.seats.map((seat) => [seat.id, seat]),
    );
    setSelectedSeats((current) => {
      const selected = new Set(current);
      for (const id of current) {
        const seat = seatsById.get(id);
        if (!seat || seat.status !== "AVAILABLE") {
          selected.delete(id);
          continue;
        }
        if (seat.seat.type === "COUPLE") {
          const partnerNumber = couplePartnerNumber(seat.seat.number);
          const partner = seatsQuery.data.seats.find(
            (candidate) =>
              candidate.seat.row === seat.seat.row &&
              candidate.seat.number === partnerNumber,
          );
          if (
            !partner ||
            partner.status !== "AVAILABLE" ||
            !selected.has(partner.id)
          ) {
            selected.delete(id);
            if (partner) selected.delete(partner.id);
          }
        }
      }
      const next = current.filter((id) => selected.has(id));
      return next.length === current.length ? current : next;
    });
  }, [seatsQuery.data, retryLocked, holdMutation.isPending]);
  const voucherIsCurrent = Boolean(
    appliedVoucher &&
    appliedVoucher.seatIds.join(',') === selectedSeats.join(',') &&
    JSON.stringify(appliedVoucher.combos) === JSON.stringify(comboSelections),
  );
  const quotedTotal = voucherIsCurrent ? appliedVoucher?.quote.totalAmount ?? null : null;
  const selectedTotal = useMemo(
    () =>
      (seatsQuery.data?.seats ?? []).reduce(
        (total, seat) =>
          selectedSeats.includes(seat.id) ? total + Number(seat.price) : total,
        0,
      ),
    [seatsQuery.data?.seats, selectedSeats],
  );
  const seatsByRow = useMemo(
    () =>
      (seatsQuery.data?.seats ?? []).reduce<Record<string, ShowtimeSeat[]>>(
        (rows, seat) => {
          rows[seat.seat.row] = [...(rows[seat.seat.row] ?? []), seat];
          return rows;
        },
        {},
      ),
    [seatsQuery.data?.seats],
  );
  function applyVoucher() {
    if (!selectedSeats.length) return;
    quoteMutation.mutate();
  }

  function submitHold() {
    if (
      appliedVoucher &&
      (appliedVoucher.seatIds.join(',') !== selectedSeats.join(',') ||
        JSON.stringify(appliedVoucher.combos) !== JSON.stringify(comboSelections))
    ) {
      setAppliedVoucher(null);
      return;
    }
    if (!user) {
      openAuth();
      return;
    }
    if (!pendingPurchase.current) {
      pendingPurchase.current = { showtimeId: showtimeId!, seats: [...selectedSeats], key: holdKey.current, combos: comboSelections, voucherCode: appliedVoucher?.code ?? null };
    }
    holdMutation.mutate();
  }
  if (!showtimeId || showtimeQuery.isError || seatsQuery.isError)
    return (
      <ErrorState
        cause={showtimeQuery.error ?? seatsQuery.error}
        fallback="Không thể tải sơ đồ ghế."
        onRetry={() => {
          void showtimeQuery.refetch();
          void seatsQuery.refetch();
        }}
      />
    );
  if (showtimeQuery.isPending || seatsQuery.isPending)
    return <LoadingState label="Đang tải sơ đồ ghế…" />;
  if (!showtimeQuery.data || !seatsQuery.data)
    return <EmptyState>Không tìm thấy suất chiếu.</EmptyState>;
  const showtime = showtimeQuery.data;
  const seats = seatsQuery.data.seats;
  const selectedSeatObjects = seats.filter((seat) =>
    selectedSeats.includes(seat.id),
  );

  const tooClose =
    showtimeCountdown.seconds > 0 &&
    showtimeCountdown.seconds <= SHOWTIME_BUFFER_SECONDS;

  function toggleSeat(seat: ShowtimeSeat) {
    if (holdMutation.isPending || retryLocked) return;
    if (seat.status !== "AVAILABLE") return;
    const partnerNumber =
      seat.seat.type === "COUPLE"
        ? couplePartnerNumber(seat.seat.number)
        : null;
    const partner =
      partnerNumber === null
        ? null
        : seats.find(
            (candidate) =>
              candidate.seat.row === seat.seat.row &&
              candidate.seat.number === partnerNumber,
          );
    if (
      seat.seat.type === "COUPLE" &&
      (!partner || partner.seat.type !== "COUPLE")
    )
      return;
    const selectedIds = partner ? [seat.id, partner.id] : [seat.id];
    const unavailablePartner = partner && partner.status !== "AVAILABLE";
    if (
      unavailablePartner ||
      (selectedIds.some((id) => selectedSeats.includes(id)) &&
        selectedIds.every((id) => selectedSeats.includes(id)))
    ) {
      holdKey.current = `hold-${crypto.randomUUID()}`;
      setAppliedVoucher(null);
      setSelectedSeats((current) =>
        current.filter((id) => !selectedIds.includes(id)),
      );
      return;
    }
    if (
      partner &&
      (selectedSeats.length + 2 > 10 || partner.seat.type !== "COUPLE")
    )
      return;
    holdKey.current = `hold-${crypto.randomUUID()}`;
    setAppliedVoucher(null);
    setSelectedSeats((current) =>
      [...new Set([...current, ...selectedIds])].slice(0, 10),
    );
  }

  const actionPending = holdMutation.isPending;

  return (
    <div className="booking-flow-page">
      {holdExpiredNotice && (
        <Alert type="error" onClose={() => setHoldExpiredNotice(false)}>
          Phiên giữ ghế đã hết hạn. Ghế đã được trả lại, vui lòng chọn lại.
        </Alert>
      )}
      {holdConflict && (
        <NoticeDialog
          title={
            holdConflict === "HELD"
              ? "Ghế vừa được người khác giữ"
              : "Ghế không còn trống"
          }
          message={
            holdConflict === "HELD"
              ? "Một hoặc nhiều ghế bạn chọn vừa được người khác giữ. Sơ đồ ghế đã được cập nhật."
              : "Một hoặc nhiều ghế bạn chọn không còn khả dụng. Vui lòng chọn lại từ sơ đồ mới nhất."
          }
          onClose={() => setHoldConflict(null)}
        />
      )}
      <div className="breadcrumb">
        <Link to={`/movies/${showtime.movie.id}`}>← Chọn suất khác</Link>
        <span>›</span>
        <strong>Chọn ghế</strong>
        <span className="hold-badge">● Giữ ghế 10 phút</span>
      </div>
      <BookingSteps active="seats" />
      <section className="showtime-meta-bar">
        <div className="showtime-meta-movie">
          <MiniPoster
            title={showtime.movie.title}
            posterUrl={showtime.movie.posterUrl}
          />
          <div>
            <div className="hero-badges">
              <span className="format-badge">Phim</span>
            </div>
            <h1>{showtime.movie.title}</h1>
          </div>
        </div>
        <div className="showtime-meta-item">
          <small>RẠP CHIẾU</small>
          <strong>{showtime.room?.cinema?.name}</strong>
          <span>{showtime.room?.name}</span>
        </div>
        <div className="showtime-meta-item">
          <small>SUẤT CHIẾU</small>
          <strong>{formatTime(showtime.startsAt)} - Hôm nay</strong>
          <span>{formatDate(showtime.startsAt)}</span>
        </div>
      </section>
      <div className="seat-workspace">
        <section className="seat-map-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SEAT MAP</p>
              <h2>Sơ đồ ghế ngồi</h2>
            </div>
            <span className="zoom-control">− &nbsp; 100% &nbsp; +</span>
          </div>
          <div className="screen-curve">
            <span>MÀN HÌNH CHIẾU / SCREEN</span>
          </div>
          <p className="screen-note">Ánh sáng cong IMAX Laser Digital 4K</p>
          <div className="seat-map-scroll">
            <div className="seat-map">
              {!seats.length && (
                <EmptyState>Suất chiếu chưa có ghế.</EmptyState>
              )}
              {Object.entries(seatsByRow).map(([row, rowSeats]) => (
                <div className="seat-row" key={row}>
                  <span className="row-label">{row}</span>
                  <div className="seat-row-items">
                    {rowSeats.map((seat, index) => (
                      <span
                        key={seat.id}
                        className={
                          index === Math.ceil(rowSeats.length / 2)
                            ? "seat-gap"
                            : ""
                        }
                      >
                        <SeatButton
                          seat={seat}
                          selected={selectedSeats.includes(seat.id)}
                          onToggle={() => toggleSeat(seat)}
                        />
                      </span>
                    ))}
                  </div>
                  <span className="row-label">{row}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="seat-legend">
            <span>
              <i className="seat standard available" />
              <small>Thường</small>
            </span>
            <span>
              <i className="seat vip available" />
              <small>VIP</small>
            </span>
            <span>
              <i className="seat couple available" />
              <small>Đôi</small>
            </span>
            <span>
              <i className="seat standard held" />
              <small>Đang giữ</small>
            </span>
            <span>
              <i className="seat standard sold" />
              <small>Đã bán</small>
            </span>
          </div>
        </section>
        <aside className="seat-summary-panel">
          <div className="summary-header">
            <p className="eyebrow">ORDER SUMMARY</p>
            <h2>Tóm tắt đặt vé</h2>
          </div>
          {selectedSeatObjects.length ? (
            <div className="summary-seats">
              {selectedSeatObjects.map((seat) => (
                <div className="summary-seat-row" key={seat.id}>
                  <span className="seat-token">
                    {seat.seat.row}
                    {seat.seat.number}
                  </span>
                  <div>
                    <strong>
                      Ghế {seat.seat.row}
                      {seat.seat.number}
                    </strong>
                    <small>{seatTypeLabel(seat.seat.type)}</small>
                  </div>
                  <span>{money(seat.price)}</span>
                </div>
              ))}
              <div className="summary-total">
                <span>Tạm tính</span>
                <strong>{money(selectedTotal + Object.values(comboDraft).reduce((sum, item) => sum + item.price * item.quantity, 0))}</strong>
              </div>
              {appliedVoucher && <div className="summary-voucher"><span>Voucher {appliedVoucher.code}<small> · lượt dùng chỉ được giữ khi bắt đầu thanh toán</small></span><strong>-{money(appliedVoucher.quote.discountAmount)}</strong></div>}
              <div className="summary-total">
                <span>Thanh toán</span>
                <strong>{money(quotedTotal ?? selectedTotal + Object.values(comboDraft).reduce((sum, item) => sum + item.price * item.quantity, 0))}</strong>
              </div>
            </div>
          ) : (
            <p className="summary-empty">Chưa chọn ghế nào.</p>
          )}
          <ComboPicker cinemaId={showtime.room?.cinema?.id} quantities={Object.fromEntries(Object.entries(comboDraft).map(([id, item]) => [id, item.quantity]))} disabled={actionPending || retryLocked} onChange={(id, quantity, price) => { holdKey.current = `hold-${crypto.randomUUID()}`; setAppliedVoucher(null); setComboDraft((current) => ({ ...current, [id]: { quantity, price } })); }} />
          <section className="voucher-panel" aria-label="Voucher giảm giá">
             <label htmlFor="voucher-code">Mã voucher <small>· lượt dùng được giữ khi bắt đầu thanh toán</small></label>
             <div className="voucher-form"><input id="voucher-code" value={voucherDraft} disabled={actionPending || retryLocked || quoteMutation.isPending} onChange={(event) => { setVoucherDraft(event.target.value.toUpperCase()); setAppliedVoucher(null); }} placeholder="Nhập mã khuyến mãi" /> <button className="secondary" type="button" disabled={!selectedSeats.length || quoteMutation.isPending || actionPending || retryLocked} onClick={applyVoucher}>{quoteMutation.isPending ? "Đang kiểm tra…" : "Áp dụng"}</button></div>
             {appliedVoucher && <p className="success-inline" role="status">Đã áp dụng {appliedVoucher.code}. Giá sẽ được xác nhận lại khi giữ ghế.</p>}
             {quoteMutation.isError && <p className="error-inline" role="alert">{errorMessage(quoteMutation.error, "Không thể áp dụng voucher.")}</p>}
           </section>
           {retryLocked && <p role="alert">Chưa xác định kết quả đặt vé. Lựa chọn được giữ nguyên; bấm lại để kiểm tra cùng yêu cầu, không tạo đơn mới.</p>}
          <div className="summary-actions">
            {tooClose && !retryLocked ? (
              <p className="summary-warning">
                Suất chiếu quá gần giờ chiếu, không thể đặt vé mới.
              </p>
            ) : (
              <button
                className="primary btn-full"
                disabled={
                  !selectedSeats.length ||
                  actionPending ||
                  quoteMutation.isPending ||
                  (Boolean(voucherDraft.trim()) && !voucherIsCurrent) ||
                  (!retryLocked && invalidComboSelection)
                }
                onClick={submitHold}
              >
                {actionPending ? "Đang giữ ghế…" : "Giữ ghế & Thanh toán"}
              </button>
            )}
            {holdMutation.isError && (
              <p className="error-inline">
                {errorMessage(holdMutation.error, "Không thể giữ ghế.")}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
