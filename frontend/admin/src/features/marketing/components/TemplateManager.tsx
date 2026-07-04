import React, { useState } from 'react';
import { Loader2, Plus, Edit2, Trash2, Send, Save, X, ExternalLink } from 'lucide-react';
import { useMarketingTemplates } from '../hooks/useMarketingTemplates';
import { createMarketingTemplate, updateMarketingTemplate, deleteMarketingTemplate } from '@/lib/api/marketing';
import { GlobalActionDialog } from '@/components/ui/GlobalActionDialog';

export function TemplateManager({ tenantSlug }: { tenantSlug: string }) {
  const { templates, isLoading, refetch } = useMarketingTemplates(tenantSlug);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    body: '',
    buttonText: '',
    actionUrl: '',
  });

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenForm = (template?: any) => {
    if (template) {
      setEditingId(template.id);
      setFormData({
        name: template.name,
        title: template.title,
        body: template.body,
        buttonText: template.buttonText || '',
        actionUrl: template.actionUrl || '',
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', title: '', body: '', buttonText: '', actionUrl: '' });
    }
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        title: formData.title,
        body: formData.body,
        buttonText: formData.buttonText || null,
        actionUrl: formData.actionUrl || null,
      };
      if (editingId) {
        await updateMarketingTemplate(tenantSlug, editingId, payload);
      } else {
        await createMarketingTemplate(tenantSlug, payload);
      }
      await refetch();
      setIsFormOpen(false);
    } catch (err) {
      console.error('Failed to save template', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteMarketingTemplate(tenantSlug, deleteConfirmId);
      await refetch();
    } catch (err) {
      console.error('Failed to delete template', err);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  return (
    <div className="bg-white rounded-[24px] border border-zinc-100 shadow-sm overflow-hidden flex flex-col h-full animate-ui-entry">
      <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
        <div>
          <h2 className="text-[18px] font-medium text-zinc-900">Message Templates</h2>
          <p className="text-[13px] text-zinc-500 mt-1">Manage your CRM broadcast templates and inline actions</p>
        </div>
        <button
          onClick={() => handleOpenForm()}
          className="h-10 px-4 bg-primary text-white rounded-[14px] text-[13px] font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus size={16} /> Create Template
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary" /></div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-300 mb-4">
              <Send size={24} />
            </div>
            <p className="text-[16px] font-medium text-zinc-900">No templates found</p>
            <p className="text-[14px] text-zinc-500 mt-2 max-w-sm">Create your first broadcast template to start sending rich messages to your customers.</p>
          </div>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="bg-zinc-50/80 border-b border-zinc-100 sticky top-0 backdrop-blur-sm z-10">
              <tr>
                <th className="px-6 py-4 text-left font-medium text-zinc-500 text-[13px] tracking-wide">Internal name</th>
                <th className="px-6 py-4 text-left font-medium text-zinc-500 text-[13px] tracking-wide">Message title</th>
                <th className="px-6 py-4 text-left font-medium text-zinc-500 text-[13px] tracking-wide">Action button</th>
                <th className="px-6 py-4 text-right font-medium text-zinc-500 text-[13px] tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {templates.map((template: any) => (
                <tr key={template.id} className="hover:bg-zinc-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-medium text-zinc-900">{template.name}</div>
                    <div className="text-[12px] text-zinc-400 mt-1">{new Date(template.createdAt).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-zinc-800">{template.title}</div>
                    <div className="text-[13px] text-zinc-500 mt-1 truncate max-w-xs">{template.body}</div>
                  </td>
                  <td className="px-6 py-4">
                    {template.actionUrl ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[12px] font-medium border border-blue-100">
                        <ExternalLink size={12} />
                        {template.buttonText || 'Link'}
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-[13px] italic">None</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenForm(template)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Edit Template"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(template.id)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete Template"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Centered Modal Form */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" onClick={() => setIsFormOpen(false)} />
          <div className="w-full max-w-4xl bg-white rounded-[24px] shadow-2xl relative flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-zinc-100 bg-white sticky top-0 z-10">
              <h3 className="text-[18px] font-medium text-zinc-900">{editingId ? 'Edit template' : 'Create template'}</h3>
              <button onClick={() => setIsFormOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 text-zinc-500 transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Side: Form Fields */}
                <div className="space-y-5">
                  <div>
                    <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">Internal name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Birthday Promo"
                      className="w-full h-12 px-4 bg-zinc-50 border border-zinc-200 rounded-[14px] text-[14px] focus:bg-white focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">Message title</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g. Happy Birthday!"
                      className="w-full h-12 px-4 bg-zinc-50 border border-zinc-200 rounded-[14px] text-[14px] font-bold focus:bg-white focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">Message body</label>
                    <textarea
                      value={formData.body}
                      onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                      placeholder="Type your message here..."
                      className="w-full h-32 p-4 bg-zinc-50 border border-zinc-200 rounded-[14px] text-[14px] resize-none focus:bg-white focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                    />
                  </div>

                  <div className="pt-4 border-t border-zinc-100">
                    <h4 className="text-[14px] font-medium text-zinc-900 mb-4">Inline action button</h4>
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">Button text</label>
                          <input
                            type="text"
                            value={formData.buttonText}
                            onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                            placeholder="e.g. Claim Free Cake"
                            className="w-full h-12 px-4 bg-zinc-50 border border-zinc-200 rounded-[14px] text-[14px] focus:bg-white focus:border-primary/40 transition-all outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">URL or Promo Code</label>
                          <input
                            type="text"
                            value={formData.actionUrl}
                            onChange={(e) => setFormData({ ...formData, actionUrl: e.target.value })}
                            placeholder="https://... or FREECAKE"
                            className="w-full h-12 px-4 bg-zinc-50 border border-zinc-200 rounded-[14px] text-[14px] focus:bg-white focus:border-primary/40 transition-all outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side: TELEGRAM PREVIEW */}
                <div>
                  <div className="p-4 bg-[#E4EFFA] rounded-[16px] relative shadow-inner sticky top-0">
                    <div className="text-[12px] font-bold text-[#2AABEE] mb-1">Telegram Preview</div>
                    <div className="bg-white p-3 rounded-[12px] rounded-tl-none shadow-sm mb-2 relative">
                      <p className="text-[14px] font-bold text-black mb-1">{formData.title || 'Message title'}</p>
                      <p className="text-[14px] text-black whitespace-pre-wrap leading-relaxed">{formData.body || 'Message body will appear here...'}</p>
                      <span className="text-[10px] text-zinc-400 absolute bottom-1 right-2">12:00</span>
                    </div>
                    {(formData.buttonText || formData.actionUrl) && (
                      <div className="w-full h-10 bg-[rgba(255,255,255,0.7)] hover:bg-[rgba(255,255,255,0.9)] backdrop-blur-md rounded-[8px] flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm">
                        <svg width="18" height="18" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="120" cy="120" r="120" fill="#24A1DE"/>
                          <path d="M54.512 117.659L179.914 69.349C185.733 67.279 190.871 70.781 189.043 77.085L167.781 177.309C166.241 184.28 162.062 186.046 156.241 182.782L124.318 159.255L108.918 174.076C107.214 175.78 105.786 177.21 102.43 177.21L104.721 144.577L164.084 90.963C166.669 88.662 163.523 87.391 160.07 89.699L86.721 135.88L55.234 126.038C48.388 123.9 48.261 119.183 56.666 115.895L54.512 117.659Z" fill="white"/>
                        </svg>
                        <span className="text-[#2AABEE] text-[14px] font-medium">{formData.buttonText || 'Open Link'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 sticky bottom-0 z-10">
              <button
                onClick={handleSave}
                disabled={isSubmitting || !formData.name || !formData.title || !formData.body}
                className="w-full h-12 bg-primary text-white rounded-[14px] text-[14px] font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Save template
              </button>
            </div>
          </div>
        </div>
      )}

      <GlobalActionDialog
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleDelete}
        title="Delete Template"
        description="Are you sure you want to delete this template? This action cannot be undone."
        confirmLabel="Delete Template"
        variant="DESTRUCTIVE"
      />
    </div>
  );
}
