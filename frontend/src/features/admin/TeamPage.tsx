import { useState, type FormEvent } from "react";
import Icon from "../../components/Icon";
import { Badge, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, useToast } from "../../components/ui";
import { api } from "../../core/api";
import { useAuth, ROLE_LABEL } from "../../core/auth";
import { formatDate } from "../../core/format";
import { errorMessage, useAsync } from "../../core/hooks";
import type { Rol, User } from "../../core/types";

type Filter = "ALL" | Rol;

export default function TeamPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => api<User[]>("/users"), []);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [form, setForm] = useState<{ user?: User } | null>(null);

  const list = (data ?? []).filter((u) => filter === "ALL" || u.rol === filter);

  const toggle = async (u: User) => {
    try {
      await api(`/users/${u.id}/toggle`, { method: "PATCH" });
      toast(u.activo ? `${u.nombre_completo} desactivado` : `${u.nombre_completo} activado`);
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Personas"
        title="Equipo"
        sub="Administradores, RPs que venden boletos y managers que validan accesos."
        actions={
          <button className="btn btn-primary" onClick={() => setForm({})}>
            <Icon name="plus" size={16} /> Nuevo usuario
          </button>
        }
      />

      <div className="toolbar">
        <div className="tabs" role="tablist">
          {(["ALL", "ADMIN", "RP", "MANAGER"] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={`tab${filter === f ? " is-active" : ""}`} onClick={() => setFilter(f)}>
              {f === "ALL" ? "Todos" : f === "RP" ? "RPs" : f === "ADMIN" ? "Admins" : "Managers"}
            </button>
          ))}
        </div>
      </div>

      <div className="card card-flush">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : list.length === 0 ? (
          <EmptyState icon="users" title="Sin usuarios en esta vista" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th className="num">Comisión</th>
                  <th>Estado</th>
                  <th>Alta</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id} className={u.activo ? "" : "is-off"}>
                    <td>
                      <div className="cell-title">
                        {u.nombre_completo} {u.id === me?.id && <span className="faint">(tú)</span>}
                      </div>
                      {u.telefono && <div className="cell-sub">{u.telefono}</div>}
                    </td>
                    <td className="mono">{u.username}</td>
                    <td>
                      <Badge tone={u.rol === "ADMIN" ? "gold" : "neutral"} plain>
                        {ROLE_LABEL[u.rol]}
                      </Badge>
                    </td>
                    <td className="num">{u.rol === "RP" ? `${u.comision_porcentaje}%` : "—"}</td>
                    <td>
                      <Badge tone={u.activo ? "success" : "neutral"}>{u.activo ? "Activo" : "Inactivo"}</Badge>
                    </td>
                    <td className="muted">{formatDate(u.creado_en)}</td>
                    <td className="actions">
                      <button className="btn btn-quiet btn-icon btn-sm" onClick={() => setForm({ user: u })} aria-label={`Editar ${u.nombre_completo}`} title="Editar">
                        <Icon name="edit" size={16} />
                      </button>
                      {u.id !== me?.id && (
                        <button className="btn btn-quiet btn-icon btn-sm" onClick={() => toggle(u)} aria-label={u.activo ? "Desactivar" : "Activar"} title={u.activo ? "Desactivar" : "Activar"}>
                          <Icon name="power" size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <UserForm
          user={form.user}
          isSelf={form.user?.id === me?.id}
          onClose={() => setForm(null)}
          onSaved={() => {
            toast(form.user ? "Usuario actualizado" : "Usuario creado");
            setForm(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function UserForm({ user, isSelf, onClose, onSaved }: { user?: User; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(user?.nombre_completo ?? "");
  const [telefono, setTelefono] = useState(user?.telefono ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<Rol>(user?.rol ?? "RP");
  const [comision, setComision] = useState(String(user?.comision_porcentaje ?? 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        nombre_completo: nombre,
        telefono,
        username,
        rol,
        comision_porcentaje: Number(comision),
      };
      if (password) body.password = password;
      if (user) await api(`/users/${user.id}`, { method: "PUT", body });
      else await api("/users", { method: "POST", body });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const canSave = nombre.trim() && username.trim().length >= 3 && (user || password.length >= 8);

  return (
    <Modal
      title={user ? "Editar usuario" : "Nuevo usuario"}
      eyebrow="Equipo"
      onClose={onClose}
      dismissable={!busy}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="user-form" className="btn btn-primary" disabled={busy || !canSave}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <form id="user-form" className="form-grid" onSubmit={submit} autoComplete="off">
        {error && (
          <div className="alert alert-error span-2" role="alert">
            {error}
          </div>
        )}
        <Field label="Nombre completo" className="span-2">
          {(id) => <input id={id} className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />}
        </Field>
        <Field label="Usuario" hint="Letras, números, punto y guiones">
          {(id) => <input id={id} className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="off" maxLength={60} />}
        </Field>
        <Field label="Teléfono" hint="Opcional">
          {(id) => <input id={id} className="input" value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" maxLength={20} />}
        </Field>
        <Field label="Rol" hint={isSelf ? "No puedes cambiar tu propio rol" : undefined}>
          {(id) => (
            <select id={id} className="select" value={rol} onChange={(e) => setRol(e.target.value as Rol)} disabled={isSelf}>
              <option value="RP">Relaciones públicas</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Administrador</option>
            </select>
          )}
        </Field>
        <Field label="Comisión (%)" hint={rol === "RP" ? "Sobre el precio de cada boleto vendido" : "Solo aplica a RPs"}>
          {(id) => <input id={id} className="input" type="number" min={0} max={100} step="0.01" value={comision} onChange={(e) => setComision(e.target.value)} disabled={rol !== "RP"} />}
        </Field>
        <Field label={user ? "Nueva contraseña" : "Contraseña"} hint={user ? "Déjala vacía para conservar la actual" : "Mínimo 12 caracteres, sin claves comunes ni el usuario"} className="span-2">
          {(id) => <input id={id} className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}
        </Field>
      </form>
    </Modal>
  );
}
