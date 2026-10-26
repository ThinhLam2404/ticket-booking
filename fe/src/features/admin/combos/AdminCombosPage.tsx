import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui";
import { errorMessage, money } from "../../../utils/format";
import { AdminPage, ConfirmDialog } from "../shared";

export function AdminCombosPage() {
  const client = useQueryClient();
  const combos = useQuery({
    queryKey: ["admin-combos"],
    queryFn: api.adminCombos,
  });
  const cinemas = useQuery({
    queryKey: ["cinemas"],
    queryFn: () => api.cinemas(),
  });
  const [cinemaId, setCinemaId] = useState("");
  const menu = useQuery({
    queryKey: ["admin-combo-menu", cinemaId],
    queryFn: () => api.adminComboMenu(cinemaId),
    enabled: Boolean(cinemaId),
  });
  const [draft, setDraft] = useState({
    id: "",
    name: "",
    description: "",
    imageUrl: "",
    active: true,
  });
  const [offer, setOffer] = useState({ comboId: "", price: "", active: true });
  const [confirm, setConfirm] = useState<"catalog" | "offer" | null>(null);
  const [notice, setNotice] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      if (confirm === "offer")
        return api.saveComboOffer(cinemaId, offer.comboId, {
          price: Number(offer.price),
          active: offer.active,
        });
      return api.saveCombo(draft.id || null, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        imageUrl: draft.imageUrl.trim() || null,
        active: draft.active,
      });
    },
    onSuccess: () => {
      setConfirm(null);
      setNotice("Đã lưu combo.");
      void client.invalidateQueries({ queryKey: ["admin-combos"] });
      void client.invalidateQueries({ queryKey: ["admin-combo-menu"] });
      void client.invalidateQueries({ queryKey: ["combo-menu"] });
    },
  });
  if (combos.isPending || cinemas.isPending)
    return <LoadingState label="Đang tải combo…" />;
  if (combos.isError || cinemas.isError)
    return (
      <ErrorState
        fallback="Không tải được danh mục combo."
        cause={combos.error ?? cinemas.error}
        onRetry={() => {
          void combos.refetch();
          void cinemas.refetch();
        }}
      />
    );
  return (
    <AdminPage>
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">BẮP & NƯỚC</p>
          <h1>Quản lý combo</h1>
          <p>Giá theo rạp. Thay đổi không ảnh hưởng combo đã mua.</p>
        </div>
      </div>
      {notice && <p role="status">{notice}</p>}
      <div className="combo-admin-grid">
        <section className="combo-panel">
          <h2>Danh mục combo</h2>
          {!combos.data?.length && <EmptyState>Chưa có combo.</EmptyState>}
          {combos.data?.map((combo) => (
            <div className="combo-row" key={combo.id}>
              <div>
                <strong>{combo.name}</strong>
                <p>{combo.description}</p>
                <small>{combo.active ? "Đang hoạt động" : "Đã tắt"}</small>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  setDraft({ ...combo, imageUrl: combo.imageUrl ?? "" });
                  setNotice("");
                }}
              >
                Chỉnh sửa
              </button>
            </div>
          ))}
        </section>
        <form
          className="combo-panel admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            save.reset();
            setConfirm("catalog");
          }}
        >
          <h2>{draft.id ? "Chỉnh sửa combo" : "Tạo combo"}</h2>
          <label>
            Tên combo
            <input
              required
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Thành phần
            <textarea
              required
              maxLength={1000}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </label>
          <label>
            Ảnh (HTTPS)
            <input
              type="url"
              pattern="https://.*"
              maxLength={2048}
              value={draft.imageUrl}
              onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />{" "}
            Đang hoạt động
          </label>
          <div className="form-actions">
            <button
              className="secondary"
              type="button"
              onClick={() =>
                setDraft({
                  id: "",
                  name: "",
                  description: "",
                  imageUrl: "",
                  active: true,
                })
              }
            >
              Tạo mới
            </button>
            <button
              className="primary"
              disabled={!draft.name.trim() || !draft.description.trim()}
            >
              Xem lại thay đổi
            </button>
          </div>
        </form>
      </div>
      <section className="combo-panel">
        <h2>Giá bán theo rạp</h2>
        <label>
          Rạp chiếu
          <select
            value={cinemaId}
            onChange={(e) => { setCinemaId(e.target.value); setOffer({ comboId: '', price: '', active: true }); setNotice(''); save.reset(); }}
          >
            <option value="">Chọn rạp</option>
            {cinemas.data?.map((cinema) => (
              <option key={cinema.id} value={cinema.id}>
                {cinema.name}
              </option>
            ))}
          </select>
        </label>
        {cinemaId && (
          <>
            {menu.isPending ? (
              <LoadingState />
            ) : menu.isError ? (
              <ErrorState
                fallback="Không tải được giá theo rạp."
                cause={menu.error}
                onRetry={() => void menu.refetch()}
              />
            ) : (
              menu.data?.map((item) => (
                <div className="combo-row" key={item.id}>
                  <strong>{item.combo.name}</strong>
                  <span>
                    {money(item.price)} ·{" "}
                    {item.active ? "Đang bán" : "Ngừng bán"}
                  </span>
                  <button
                    className="secondary"
                    onClick={() =>
                      setOffer({
                        comboId: item.comboId,
                        price: item.price,
                        active: item.active,
                      })
                    }
                  >
                    Sửa giá bán
                  </button>
                </div>
              ))
            )}
            <form
              className="admin-form"
              onSubmit={(e) => {
                e.preventDefault();
                save.reset();
                setConfirm("offer");
              }}
            >
              <label>
                Combo
                <select
                  required
                  value={offer.comboId}
                  onChange={(e) =>
                    setOffer({ ...offer, comboId: e.target.value })
                  }
                >
                  <option value="">Chọn combo</option>
                  {combos.data?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Giá bán (VND)
                <input
                  required
                  type="number"
                  min="1"
                  max="99999999.99"
                  step="0.01"
                  value={offer.price}
                  onChange={(e) =>
                    setOffer({ ...offer, price: e.target.value })
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={offer.active}
                  onChange={(e) =>
                    setOffer({ ...offer, active: e.target.checked })
                  }
                />{" "}
                Đang bán tại rạp
              </label>
              <button className="primary">Xem lại giá bán</button>
            </form>
          </>
        )}
      </section>
      {confirm && (
        <ConfirmDialog
          state={{ title: 'Lưu thay đổi combo?', onConfirm: () => save.mutate(), message:
            confirm === "catalog"
              ? `${draft.name} — ${draft.active ? "Hoạt động" : "Tắt"}`
              : `${cinemas.data?.find((item) => item.id === cinemaId)?.name} — ${combos.data?.find((item) => item.id === offer.comboId)?.name} — ${money(offer.price)} — ${offer.active ? 'Đang bán' : 'Ngừng bán'}`
          }}
          loading={save.isPending}
          error={save.isError ? errorMessage(save.error, 'Không thể lưu combo.') : ""}
          onClose={() => setConfirm(null)}
        />
      )}
    </AdminPage>
  );
}
