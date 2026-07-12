import { useState, useRef } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, CheckCircle2, Calendar, Pencil,
  Trash2, Copy, Bell, X, MoreVertical,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  useListSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  useActivateSchedule,
  useCopySchedule,
  getListSchedulesQueryKey,
  getGetScheduleQueryKey,
  getGetDashboardQueryKey,
} from "@/lib/api-client";

export default function Schedules() {
  const { data: _rawSchedules, isLoading } = useListSchedules();
  const schedules = Array.isArray(_rawSchedules) ? _rawSchedules : [];
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen,   setEditOpen]   = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  // editName / editDesc hold the INITIAL value used as defaultValue on the
  // uncontrolled inputs.  The live value is read via refs on submit so that
  // Android's Arabic IME never fights React's controlled-input reconciliation
  // (a known WebView bug that makes only the first 1-2 characters stick).
  const [editName,   setEditName]   = useState("");
  const [editDesc,   setEditDesc]   = useState("");
  const [nameError,  setNameError]  = useState("");

  // DOM refs only — we read .value directly on submit.
  // No onChange/onInput handlers anywhere: zero React interference
  // with the Android IME composition pipeline.
  const editNameRef   = useRef<HTMLInputElement>(null);
  const editDescRef   = useRef<HTMLTextAreaElement>(null);
  const createNameRef = useRef<HTMLInputElement>(null);
  const createDescRef = useRef<HTMLTextAreaElement>(null);

  const createSchedule  = useCreateSchedule();
  const updateSchedule  = useUpdateSchedule();
  const deleteSchedule  = useDeleteSchedule();
  const activateSchedule = useActivateSchedule();
  const copySchedule    = useCopySchedule();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListSchedulesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const selectedSchedule = schedules.find((s) => s.id === selectedId);

  const openCreate = () => {
    setCreateName(""); setCreateDesc(""); setNameError("");
    setCreateOpen(true);
  };

  const handleCreate = () => {
    setNameError("");
    const newName = (createNameRef.current?.value ?? "").trim();
    const newDesc = (createDescRef.current?.value ?? "").trim();
    if (!newName) { setNameError("اسم الجدول مطلوب"); return; }
    createSchedule.mutate(
      { data: { name: newName, description: newDesc || undefined } },
      {
        onSuccess: () => {
          invalidateAll();
          setCreateOpen(false);
          toast({ title: "تم إنشاء الجدول بنجاح" });
        },
        onError: () => {
          toast({ title: "فشل إنشاء الجدول", description: "تحقق من اتصالك وحاول مرة أخرى", variant: "destructive" });
        },
      }
    );
  };

  const openMenu = (id: number) => { setSelectedId(id); setMenuOpen(true); };

  const openEdit = () => {
    if (!selectedSchedule) return;
    setEditName(selectedSchedule.name);
    setEditDesc((selectedSchedule as { description?: string | null }).description ?? "");
    setNameError("");
    updateSchedule.reset();
    setMenuOpen(false);
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!selectedId) return;
    // Read directly from the DOM — the single source of truth.
    // No React state was ever synced to this input after mount,
    // so .value always reflects exactly what the user typed.
    setNameError("");
    const newName = (editNameRef.current?.value ?? "").trim();
    const newDesc = (editDescRef.current?.value ?? "").trim();
    if (!newName) { setNameError("اسم الجدول مطلوب"); return; }
    const idToUpdate = selectedId;

    updateSchedule.mutate(
      { id: idToUpdate, data: { name: newName, description: newDesc || undefined } },
      {
        onSuccess: () => {
          console.log("[BellCraft] rename succeeded for id", idToUpdate);
          invalidateAll();
          queryClient.invalidateQueries({ queryKey: getGetScheduleQueryKey(idToUpdate) });
          setEditOpen(false);
          toast({ title: "تم تحديث الجدول بنجاح" });
        },
        onError: (err) => {
          // Keep dialog open — show error inside the form so the user can retry
          const detail = err instanceof Error ? err.message : String(err);
          console.error("[BellCraft] rename failed:", detail);
          setNameError(`فشل الحفظ — ${detail}`);
        },
      }
    );
    // *** Do NOT call setEditOpen(false) here ***
    // The dialog must stay open until onSuccess fires so the user can see
    // whether the save worked, and retry on network / server errors.
  };

  const openDelete = () => { setMenuOpen(false); setDeleteOpen(true); };

  const handleDelete = () => {
    if (!selectedId) return;
    deleteSchedule.mutate(
      { id: selectedId },
      {
        onSuccess: () => {
          invalidateAll();
          setDeleteOpen(false);
          toast({ title: "تم حذف الجدول" });
        },
      }
    );
  };

  const handleActivate = (id: number) => {
    activateSchedule.mutate(
      { id },
      { onSuccess: () => { invalidateAll(); toast({ title: "تم تفعيل الجدول" }); } }
    );
  };

  const handleCopy = () => {
    if (!selectedId) return;
    setMenuOpen(false);
    copySchedule.mutate(
      { id: selectedId },
      { onSuccess: () => { invalidateAll(); toast({ title: "تم نسخ الجدول بنجاح" }); } }
    );
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الجداول الدراسية</h1>
          <p className="text-muted-foreground text-sm mt-0.5">إنشاء وإدارة جداول الحصص الأسبوعية</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-700 text-white text-sm font-bold tap shadow-sm"
        >
          <Plus className="w-4 h-4" />
          جدول جديد
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      ) : schedules.length > 0 ? (
        <div className="space-y-3">
          <AnimatePresence>
            {schedules.map((schedule, i) => (
              <motion.div
                key={schedule.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, delay: i * 0.04 }}
                className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${
                  schedule.isActive
                    ? "border-blue-300 ring-1 ring-blue-100"
                    : "border-slate-200"
                }`}
              >
                {schedule.isActive && (
                  <div className="h-1 bg-blue-700 w-full" />
                )}
                <div className="p-4 flex items-start gap-3">
                  <div
                    className={`mt-0.5 p-2.5 rounded-xl shrink-0 ${
                      schedule.isActive
                        ? "bg-blue-700 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Calendar className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-base leading-tight">
                        {schedule.name}
                      </span>
                      {schedule.isActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-700 text-white text-xs font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          نشط
                        </span>
                      )}
                    </div>
                    {(schedule as { description?: string | null }).description && (
                      <p className="text-sm text-slate-400 mt-0.5 truncate">
                        {(schedule as { description?: string | null }).description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      <Link href={`/schedules/${schedule.id}`}>
                        <button
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tap ${
                            schedule.isActive
                              ? "bg-blue-700 text-white"
                              : "border border-slate-200 text-slate-700 bg-white"
                          }`}
                        >
                          <Bell className="w-3.5 h-3.5" />
                          عرض الحصص
                        </button>
                      </Link>
                      {!schedule.isActive && (
                        <button
                          onClick={() => handleActivate(schedule.id)}
                          disabled={activateSchedule.isPending}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-700 tap disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          تفعيل
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => openMenu(schedule.id)}
                    className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center tap shrink-0"
                  >
                    <MoreVertical className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-7 h-7 text-slate-400" />
          </div>
          <h2 className="text-lg font-bold mb-1 text-slate-800">لا توجد جداول بعد</h2>
          <p className="text-slate-400 text-sm mb-5">ابدأ بإنشاء جدول جديد لتنظيم حصصك الدراسية</p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 text-white font-bold text-sm tap shadow-sm"
          >
            <Plus className="w-4 h-4" />
            إنشاء جدول جديد
          </button>
        </div>
      )}

      {/* ── Three-dot action menu sheet ──────────────────────────────────────── */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-3xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              dir="rtl"
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>
              <div className="px-4 pt-2 pb-3">
                <p className="text-xs font-bold text-slate-400 mb-3 text-center truncate px-8">
                  {selectedSchedule?.name}
                </p>
                <div className="space-y-1">
                  <button
                    onClick={openEdit}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-slate-50 text-slate-800 font-bold text-sm tap"
                  >
                    <Pencil className="w-4 h-4 text-slate-500" />
                    تعديل الاسم
                  </button>
                  <button
                    onClick={handleCopy}
                    disabled={copySchedule.isPending}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-slate-50 text-slate-800 font-bold text-sm tap disabled:opacity-50"
                  >
                    <Copy className="w-4 h-4 text-slate-500" />
                    نسخ الجدول
                  </button>
                  <button
                    onClick={openDelete}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-red-50 text-red-600 font-bold text-sm tap"
                  >
                    <Trash2 className="w-4 h-4" />
                    حذف الجدول
                  </button>
                </div>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="w-full mt-2 py-3.5 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm tap"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Create schedule sheet ────────────────────────────────────────────── */}
      <AnimatePresence>
        {createOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreateOpen(false)}
            />
            <motion.div
              className="fixed bottom-0 inset-x-0 z-[51] bg-white rounded-t-3xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <h3 className="font-extrabold text-slate-800 text-base">إنشاء جدول جديد</h3>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center tap"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); handleCreate(); }}
                className="p-5 space-y-4 pb-8"
              >
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">اسم الجدول</label>
                  <input
                    key={`create-name-${createOpen}`}
                    ref={createNameRef}
                    type="text"
                    defaultValue=""
                    maxLength={100}
                    dir="rtl"
                    inputMode="text"
                    enterKeyHint="next"
                    placeholder="مثال: جدول الفصل الأول"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  {nameError && (
                    <p className="text-xs text-red-500 mt-1 font-bold">{nameError}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">الوصف (اختياري)</label>
                  <textarea
                    key={`create-desc-${createOpen}`}
                    ref={createDescRef}
                    defaultValue=""
                    placeholder="أضف وصفاً للجدول..."
                    dir="rtl"
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm tap"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={createSchedule.isPending}
                    className="flex-1 py-3 rounded-2xl bg-blue-700 text-white font-bold text-sm tap disabled:opacity-50"
                  >
                    {createSchedule.isPending ? "جارٍ الإنشاء…" : "إنشاء"}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Edit schedule sheet ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {editOpen && (
          <>
            {/* backdrop — z-50, closes sheet on outside tap */}
            <motion.div
              className="fixed inset-0 bg-black/40 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditOpen(false)}
            />
            {/* sheet — z-[51] ensures it sits ABOVE the backdrop on Android */}
            <motion.div
              className="fixed bottom-0 inset-x-0 z-[51] bg-white rounded-t-3xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <h3 className="font-extrabold text-slate-800 text-base">تعديل الجدول</h3>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center tap"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              {/* form: lets Android keyboard "Done" key trigger save */}
              <form
                onSubmit={(e) => { e.preventDefault(); handleEdit(); }}
                className="p-5 space-y-4 pb-8"
              >
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">اسم الجدول</label>
                  {/* Uncontrolled input + ref: avoids Android Arabic-IME bug where
                      React's controlled reconciliation resets the cursor after every
                      keystroke, making only the first 1-2 characters stick. */}
                  <input
                    key={`edit-name-${selectedId}`}
                    ref={editNameRef}
                    type="text"
                    defaultValue={editName}
                    maxLength={100}
                    dir="rtl"
                    inputMode="text"
                    enterKeyHint="done"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  {nameError && (
                    <p className="text-xs text-red-500 mt-1 font-bold">{nameError}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">الوصف (اختياري)</label>
                  <textarea
                    key={`edit-desc-${selectedId}`}
                    ref={editDescRef}
                    defaultValue={editDesc}
                    placeholder="وصف قصير..."
                    dir="rtl"
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm tap"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={updateSchedule.isPending}
                    className="flex-1 py-3 rounded-2xl bg-blue-700 text-white font-bold text-sm tap disabled:opacity-60"
                  >
                    {updateSchedule.isPending ? "جارٍ الحفظ…" : "حفظ"}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Delete confirmation ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {deleteOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteOpen(false)}
            />
            <motion.div
              className="fixed inset-x-5 top-1/2 -translate-y-1/2 z-50 bg-white rounded-3xl p-6 shadow-2xl"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              dir="rtl"
            >
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-center font-extrabold text-slate-800 text-lg mb-2">حذف الجدول</h3>
              <p className="text-center text-sm text-slate-500 mb-6 leading-relaxed">
                هل أنت متأكد من الرغبة في حذف هذا الجدول؟
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteOpen(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm tap"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteSchedule.isPending}
                  className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-bold text-sm tap disabled:opacity-60"
                >
                  {deleteSchedule.isPending ? "جارٍ الحذف…" : "حذف"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
