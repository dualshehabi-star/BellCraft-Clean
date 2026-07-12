import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, BookOpen, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSubjects,
  useCreateSubject,
  useUpdateSubject,
  useDeleteSubject,
  getListSubjectsQueryKey,
} from "@/lib/api-client";

const PRESET_COLORS = [
  "#1d4ed8", "#0891b2", "#059669", "#d97706",
  "#dc2626", "#7c3aed", "#db2777", "#ea580c",
  "#65a30d", "#0284c7", "#9333ea", "#e11d48",
];

type SubjectForm = { name: string; color: string };
const EMPTY_FORM: SubjectForm = { name: "", color: PRESET_COLORS[0] };

export default function Subjects() {
  const queryClient = useQueryClient();
  const { data: _rawSubjects, isLoading } = useListSubjects();
  const subjects = Array.isArray(_rawSubjects) ? _rawSubjects : [];
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<SubjectForm>(EMPTY_FORM);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<SubjectForm>(EMPTY_FORM);

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListSubjectsQueryKey() });

  const handleAdd = () => {
    if (!addForm.name.trim()) return;
    createSubject.mutate(
      { data: { name: addForm.name.trim(), color: addForm.color } },
      {
        onSuccess: () => {
          invalidate();
          setShowAdd(false);
          setAddForm(EMPTY_FORM);
        },
      }
    );
  };

  const startEdit = (id: number, name: string, color: string) => {
    setEditingId(id);
    setEditForm({ name, color });
  };

  const handleEdit = () => {
    if (!editingId || !editForm.name.trim()) return;
    updateSubject.mutate(
      { id: editingId, data: { name: editForm.name.trim(), color: editForm.color } },
      { onSuccess: () => { invalidate(); setEditingId(null); } }
    );
  };

  const handleDelete = (id: number) => {
    deleteSubject.mutate(
      { id },
      { onSuccess: () => { invalidate(); setDeleteId(null); } }
    );
  };

  return (
    <div className="space-y-5 pb-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <button className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center tap card-shadow">
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">المواد الدراسية</h1>
          <p className="text-xs text-slate-500">
            {subjects.length > 0 ? `${subjects.length} مادة مضافة` : "لا توجد مواد بعد"}
          </p>
        </div>
      </div>

      {/* Add button */}
      {!showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-700 text-white font-bold text-sm tap shadow-md"
        >
          <Plus className="w-4 h-4" />
          إضافة مادة
        </button>
      )}

      {/* Inline add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-blue-800">مادة جديدة</span>
              <button
                onClick={() => { setShowAdd(false); setAddForm(EMPTY_FORM); }}
                className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center tap"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 block">اسم المادة</label>
              <input
                autoFocus
                type="text"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="مثال: الرياضيات"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 mb-2 block">لون المادة</label>
              <div className="flex flex-wrap gap-2.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAddForm({ ...addForm, color: c })}
                    className="w-9 h-9 rounded-full flex items-center justify-center tap"
                    style={{
                      background: c,
                      transform: addForm.color === c ? "scale(1.15)" : undefined,
                      boxShadow: addForm.color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : undefined,
                    }}
                  >
                    {addForm.color === c && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleAdd}
              disabled={!addForm.name.trim() || createSubject.isPending}
              className="w-full py-3 rounded-xl bg-blue-700 text-white font-bold text-sm tap disabled:opacity-50"
            >
              {createSubject.isPending ? "جارٍ الحفظ…" : "إضافة"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subjects list */}
      {isLoading ? (
        <div className="py-10 text-center">
          <span className="w-6 h-6 rounded-full border-2 border-blue-400 border-t-transparent animate-spin inline-block" />
        </div>
      ) : subjects.length === 0 && !showAdd ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-dashed border-slate-200 bg-white/60 py-14 text-center"
        >
          <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400">لا توجد مواد بعد</p>
          <p className="text-xs text-slate-400 mt-1">اضغط "إضافة مادة" للبدء</p>
        </motion.div>
      ) : subjects.length > 0 ? (
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white card-shadow">
          <AnimatePresence initial={false}>
            {subjects.map((subject, i) => (
              <motion.div
                key={subject.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className={`border-b border-slate-100 last:border-b-0 ${i % 2 === 1 ? "bg-slate-50/40" : ""}`}
              >
                {editingId === subject.id ? (
                  <div className="px-4 py-3 space-y-3">
                    <input
                      autoFocus
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && handleEdit()}
                      className="w-full px-3 py-2 rounded-xl border border-blue-300 bg-white text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100"
                    />
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditForm({ ...editForm, color: c })}
                          className="w-8 h-8 rounded-full flex items-center justify-center tap"
                          style={{
                            background: c,
                            transform: editForm.color === c ? "scale(1.15)" : undefined,
                            boxShadow: editForm.color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined,
                          }}
                        >
                          {editForm.color === c && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleEdit}
                        disabled={!editForm.name.trim() || updateSubject.isPending}
                        className="flex-1 py-2 rounded-xl bg-blue-700 text-white text-sm font-bold tap disabled:opacity-50"
                      >
                        حفظ
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold tap"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl shrink-0 shadow-sm"
                        style={{ background: subject.color }}
                      />
                      <p className="font-bold text-sm text-slate-900">{subject.name}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(subject.id, subject.name, subject.color)}
                        className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center tap"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      {deleteId === subject.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleDelete(subject.id)}
                            className="h-9 px-3 rounded-xl bg-red-600 text-white text-xs font-bold tap"
                          >
                            حذف
                          </button>
                          <button
                            onClick={() => setDeleteId(null)}
                            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center tap"
                          >
                            <X className="w-3.5 h-3.5 text-slate-500" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteId(subject.id)}
                          className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center tap"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}
