import React, { useState } from 'react';
import { Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { useMarketingTemplates } from '../hooks/useMarketingTemplates';
import { createMarketingTemplate, sendCrmBroadcast, deleteMarketingTemplate } from '@/lib/api/marketing';
import { cn } from '@/lib/utils/cn';

interface CustomerMessagingProps {
  tenantSlug: string;
  selectedCustomerIds: string[];
  onSuccess?: () => void;
}

export function CustomerMessaging({ tenantSlug, selectedCustomerIds, onSuccess }: CustomerMessagingProps) {
  const { templates, isLoading, refetch } = useMarketingTemplates(tenantSlug);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [messageSuccess, setMessageSuccess] = useState<boolean | null>(null);

  // New Template State
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    title: '',
    body: '',
    buttonText: '',
    actionUrl: '',
  });

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const handleCreateTemplate = async () => {
    try {
      const created = await createMarketingTemplate(tenantSlug, newTemplate);
      await refetch();
      setSelectedTemplateId(created.id);
      setIsCreatingNew(false);
      setNewTemplate({ name: '', title: '', body: '', buttonText: '', actionUrl: '' });
    } catch (err) {
      console.error('Failed to create template', err);
    }
  };

  const handleSendBroadcast = async () => {
    if (!selectedTemplateId || selectedCustomerIds.length === 0) return;
    setIsSending(true);
    setMessageSuccess(null);
    try {
      await sendCrmBroadcast(tenantSlug, {
        templateId: selectedTemplateId,
        customerIds: selectedCustomerIds,
      });
      setMessageSuccess(true);
      if (onSuccess) onSuccess();
      setTimeout(() => setMessageSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to send broadcast', err);
      setMessageSuccess(false);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Template Selection */}
      {!isCreatingNew ? (
        <div className="space-y-3">
          <label className="text-[13px] font-medium text-zinc-700 block">Select Message Template</label>
          <div className="flex gap-2">
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="flex-1 h-12 px-4 bg-zinc-50 border border-zinc-100 rounded-[16px] text-[14px] text-zinc-900 focus:outline-none focus:bg-white focus:border-primary/30 transition-all duration-300"
            >
              <option value="">Choose a template</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {selectedTemplateId && (
              <button
                onClick={async () => {
                  if (confirm('Are you sure you want to delete this template?')) {
                    await deleteMarketingTemplate(tenantSlug, selectedTemplateId);
                    setSelectedTemplateId('');
                    refetch();
                  }
                }}
                className="h-12 w-12 bg-red-50 text-red-600 rounded-[16px] flex items-center justify-center hover:bg-red-100 transition-colors"
                title="Delete Template"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={() => setIsCreatingNew(true)}
              className="h-12 px-4 bg-zinc-100 text-zinc-700 rounded-[16px] text-[14px] font-medium flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors"
            >
              <Plus size={16} />New
            </button>
          </div>

          {/* Template Preview */}
          {selectedTemplate && (
            <div className="mt-4 p-4 border border-zinc-200 bg-white rounded-[16px] shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-primary"></div>
              <p className="text-[14px] font-bold text-zinc-900">{selectedTemplate.title}</p>
              <p className="text-[13px] text-zinc-600 mt-2 whitespace-pre-wrap">{selectedTemplate.body}</p>
              {selectedTemplate.actionUrl && (
                <div className="mt-4 pt-3 border-t border-zinc-100">
                  <span className="inline-flex items-center justify-center w-full h-10 bg-primary/10 text-primary font-medium text-[13px] rounded-lg">
                    {selectedTemplate.buttonText || 'Click Here'}
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleSendBroadcast}
            disabled={isSending || !selectedTemplateId || selectedCustomerIds.length === 0}
            className="w-full h-12 mt-4 bg-primary text-white rounded-[16px] text-[14px] font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Send to {selectedCustomerIds.length} Customer{selectedCustomerIds.length !== 1 ? 's' : ''}
          </button>
        </div>
      ) : (
        /* Create New Template Form */
        <div className="space-y-4 bg-zinc-50 p-4 rounded-[16px] border border-zinc-100">
          <div className="flex justify-between items-center">
            <h4 className="text-[14px] font-medium text-zinc-900">Create New Template</h4>
            <button onClick={() => setIsCreatingNew(false)} className="text-[12px] text-zinc-500 hover:text-zinc-900">Cancel</button>
          </div>
          <input
            type="text"
            placeholder="Template Name (Internal)"
            value={newTemplate.name}
            onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
            className="w-full h-10 px-3 bg-white border border-zinc-200 rounded-[10px] text-[13px]"
          />
          <input
            type="text"
            placeholder="Message Title"
            value={newTemplate.title}
            onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
            className="w-full h-10 px-3 bg-white border border-zinc-200 rounded-[10px] text-[13px]"
          />
          <textarea
            placeholder="Message Body"
            value={newTemplate.body}
            onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
            className="w-full h-24 p-3 bg-white border border-zinc-200 rounded-[10px] text-[13px] resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Button Text (Optional)"
              value={newTemplate.buttonText}
              onChange={(e) => setNewTemplate({ ...newTemplate, buttonText: e.target.value })}
              className="w-full h-10 px-3 bg-white border border-zinc-200 rounded-[10px] text-[13px]"
            />
            <input
              type="url"
              placeholder="Action URL (Optional)"
              value={newTemplate.actionUrl}
              onChange={(e) => setNewTemplate({ ...newTemplate, actionUrl: e.target.value })}
              className="w-full h-10 px-3 bg-white border border-zinc-200 rounded-[10px] text-[13px]"
            />
          </div>
          <button
            onClick={handleCreateTemplate}
            disabled={!newTemplate.name || !newTemplate.title || !newTemplate.body}
            className="w-full h-10 bg-zinc-900 text-white rounded-[10px] text-[13px] font-medium disabled:opacity-50"
          >
            Save Template
          </button>
        </div>
      )}

      {/* Success/Error Feedback */}
      {messageSuccess === true && (
        <p className="text-[13px] text-green-600 text-center font-medium mt-1">Broadcast sent successfully!</p>
      )}
      {messageSuccess === false && (
        <p className="text-[13px] text-red-600 text-center font-medium mt-1">Failed to send broadcast.</p>
      )}
    </div>
  );
}
