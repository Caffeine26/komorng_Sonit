"use client";

import React from "react";
import {
  Plus,
  RefreshCw,
  Search,
  Edit2,
  Users,
  QrCode,
  Image as ImageIcon,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TableFormModal } from "@/features/table-management/components/TableFormModal";
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog";
import { useParams } from "next/navigation";
import { getAdminTables, createAdminTable, updateAdminTable, deleteAdminTable, trackAdminTablePrint, type TableItem } from "@/lib/api/table";
import { getAdminSettings } from "@/lib/api/settings";
import { useTranslations } from "next-intl";

export default function TableManagementPage() {
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;
  const t = useTranslations("tables");

  const [searchQuery, setSearchQuery] = React.useState("");
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedTable, setSelectedTable] = React.useState<any | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [tableToDelete, setTableToDelete] = React.useState<TableItem | null>(null);
  const [dialogMsg, setDialogMsg] = React.useState<{ title: string, message: string } | null>(null);

  const [tables, setTables] = React.useState<TableItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tenant, setTenant] = React.useState<any>(null);

  const fetchTables = async () => {
    setLoading(true);
    try {
      const data = await getAdminTables(tenantSlug);
      setTables(data);
    } catch (err) {
      console.error("Failed to load tables:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTenantSettings = async () => {
    try {
      const data = await getAdminSettings(tenantSlug);
      setTenant(data);
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  React.useEffect(() => {
    if (tenantSlug) {
      fetchTables();
      fetchTenantSettings();
    }
  }, [tenantSlug]);

  const handleEdit = (table: TableItem) => {
    setSelectedTable(table);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedTable(null);
    setIsModalOpen(true);
  };

  const handlePrintQR = async (table: TableItem) => {
    if (!table.qrToken) {
      setDialogMsg({ title: "Notice", message: "No active QR Code token generated for this table." });
      return;
    }

    try {
      await trackAdminTablePrint(table.id, tenantSlug);
    } catch (err) {
      console.error("Failed to track print event:", err);
    }

    const storefrontUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL || window.location.origin;
    const qrUrl = `${storefrontUrl}/${tenantSlug}?qr=${table.qrToken}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrUrl)}&ecc=M&margin=0&qzone=2`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setDialogMsg({ title: "Notice", message: "Pop-up blocker prevented opening print window. Please allow pop-ups for this site." });
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Print QR Code - ${table.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap');
            body {
              font-family: 'Outfit', sans-serif;
              margin: 0;
              padding: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              background-color: #f4f5f6;
            }
            .card {
              background: white;
              padding: 40px;
              border-radius: 32px;
              box-shadow: 0 20px 50px rgba(0,0,0,0.05);
              text-align: center;
              max-width: 400px;
              width: 100%;
              box-sizing: border-box;
              border: 1px solid #e2e8f0;
            }
            .header {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 16px;
              margin-bottom: 12px;
            }
            .logo {
              width: 64px;
              height: 64px;
              border-radius: 12px;
              object-fit: contain;
            }
            .restaurant-name {
              font-size: 24px;
              font-weight: 600;
              color: #0f172a;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 0;
            }
            .table-label {
              font-size: 18px;
              font-weight: 400;
              color: #64748b;
              margin-bottom: 24px;
            }
            .qr-container {
              background: #f8fafc;
              padding: 24px;
              border-radius: 24px;
              display: inline-block;
              border: 1px dashed #cbd5e1;
              margin-bottom: 24px;
            }
            .qr-image {
              width: 250px;
              height: 250px;
              display: block;
            }
            .instructions {
              font-size: 14px;
              font-weight: 400;
              color: #475569;
              line-height: 1.6;
            }
            .instructions strong {
              color: #0f172a;
            }
            @media print {
              body {
                background: white;
              }
              .card {
                box-shadow: none;
                border: none;
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              ${tenant?.settings?.logoUrl ? `<img class="logo" src="${tenant.settings.logoUrl}" alt="Logo" />` : ''}
              <div class="restaurant-name">${tenant?.nameEn || 'KOMORNG'}</div>
            </div>
            <div class="table-label">${table.name}</div>
            <div class="qr-container">
              <img class="qr-image" src="${qrImageUrl}" alt="Table QR Code" />
            </div>
            <div class="instructions">
              <strong>Scan to Order & Pay</strong><br>
              Direct digital access to our menu and service.
            </div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleFormSubmit = async (data: any) => {
    try {
      if (selectedTable) {
        await updateAdminTable(selectedTable.id, data, tenantSlug);
      } else {
        await createAdminTable(data, tenantSlug);
      }
      setIsModalOpen(false);
      fetchTables();
    } catch (err: any) {
      setDialogMsg({ title: "Error", message: err.message || "Failed to save table" });
    }
  };

  const handleDeleteClick = (table: TableItem) => {
    setTableToDelete(table);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!tableToDelete) return;
    try {
      await deleteAdminTable(tableToDelete.id, tenantSlug);
      fetchTables();
      setIsDeleteDialogOpen(false);
      setTableToDelete(null);
    } catch (err: any) {
      setDialogMsg({ title: "Error", message: err.message || "Failed to delete table" });
    }
  };

  const filteredTables = tables.filter((table) =>
    table.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-50/10 flex flex-col animate-ui-entry">

      {/* ── TOP BAR: Transparent/Flush Layout ── */}
      <header className="py-4 sm:py-6 px-4 md:px-8 lg:px-10 flex flex-col lg:flex-row lg:items-center gap-4 justify-between flex-shrink-0 relative z-50">
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 flex-1 w-full max-w-3xl">
          <div className="flex-1 w-full">
            <h1 className="text-[20px] sm:text-[26px] font-normal text-zinc-950 tracking-tight leading-none">{t('title')}</h1>
            <p className="text-[12px] sm:text-[14px] font-normal text-zinc-950/40 mt-1">{t('desc')}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 flex-1 w-full max-w-2xl lg:px-6">
          <div className="relative w-full">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-950/60" />
            <input
              type="text"
              placeholder={t('search_placeholder')}
              className="w-full h-11 sm:h-12 pl-12 pr-6 bg-white/60 border border-zinc-100 rounded-xl text-[13px] sm:text-[14px] font-normal text-zinc-950 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary/10 transition-all placeholder:text-zinc-950/40"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 w-full lg:w-auto justify-end sm:justify-start lg:justify-end">
          <button
            onClick={fetchTables}
            className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 bg-white border border-zinc-100 rounded-xl flex items-center justify-center text-zinc-950 hover:bg-zinc-50 transition-all cursor-pointer shadow-sm"
          >
            <RefreshCw size={18} className="text-zinc-950" />
          </button>
          <button
            onClick={handleCreate}
            className="h-11 sm:h-12 flex-1 sm:flex-none sm:px-8 bg-primary text-white rounded-xl flex items-center justify-center gap-2 sm:gap-3 text-[13px] sm:text-[14px] font-normal hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus size={18} strokeWidth={3} />
            <span>{t('new_table')}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 lg:p-10 pb-24 flex flex-col min-h-[calc(100vh-96px)]">
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="h-7 px-3 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-[12px] font-normal text-white tracking-tight">{filteredTables.length} {t('active_tables')}</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
            <RefreshCw className="animate-spin text-primary" size={32} />
            <p className="text-[14px] text-zinc-400 mt-4">{t('loading_tables')}</p>
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] bg-white border border-zinc-100 rounded-[32px] p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
            <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-350 mb-4">
              <QrCode size={28} />
            </div>
            <h3 className="text-[18px] font-normal text-zinc-950">{t('no_tables')}</h3>
            <p className="text-[13px] text-zinc-400 mt-1 max-w-[280px] mx-auto">{t('no_tables_desc')}</p>
            <button
              onClick={handleCreate}
              className="mt-6 h-11 px-6 bg-primary text-white rounded-xl text-[13px] font-normal hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2 mx-auto"
            >
              <Plus size={16} strokeWidth={3} />
              <span>{t('create_first_table')}</span>
            </button>
          </div>
        ) : (
          /* Tables Grid: Adaptive 3x3 Pattern */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 animate-in fade-in duration-300">
            {filteredTables.map((table) => (
              <div
                key={table.id}
                className="group bg-white border border-zinc-100 rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-xl hover:shadow-zinc-200/40 hover:-translate-y-1 transition-all duration-500 cursor-pointer overflow-hidden relative"
              >
                {/* Table Image / Placeholder */}
                <div className="aspect-[16/10] bg-zinc-50 rounded-[20px] sm:rounded-[24px] mb-4 sm:mb-6 flex items-center justify-center border border-zinc-100 overflow-hidden relative">
                  {table.image ? (
                    <img
                      src={table.image}
                      alt={table.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-zinc-300 group-hover:text-zinc-400 transition-colors">
                      <ImageIcon size={32} strokeWidth={1.5} />
                      <span className="text-[9px] sm:text-[10px] font-normal tracking-tight">{t('no_image')}</span>
                    </div>
                  )}
                  {/* Status Badge Over Image */}
                  <div className={cn(
                    "absolute top-4 right-4 h-7 px-3 rounded-lg flex items-center justify-center text-[10px] font-normal border shadow-sm capitalize",
                    table.status === "available" ? "bg-emerald-500 text-white border-emerald-400" :
                      table.status === "occupied" ? "bg-rose-500 text-white border-rose-400" :
                        table.status === "reserved" ? "bg-amber-500 text-white border-amber-400" :
                          "bg-zinc-500 text-white border-zinc-400"
                  )}>
                    {t(table.status as any)}
                  </div>
                </div>

                {/* Table Details */}
                <div className="flex flex-col gap-4 px-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[18px] sm:text-[20px] font-normal text-zinc-950 tracking-tight leading-none">{table.name}</h3>
                    <div className="flex items-center gap-2 text-zinc-950/60">
                      <Users size={15} className="text-zinc-950" />
                      <div className="flex items-center gap-1">
                        <span className="text-[13px] font-medium text-zinc-950">{table.capacity}</span>
                        <span className="text-[12px] font-normal">{t('seats')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrintQR(table);
                      }}
                      className="flex items-center justify-center px-4 py-2 rounded-lg bg-[#EE2C3B] text-white hover:bg-[#D42533] transition-all duration-300 cursor-pointer shadow-sm active:scale-95 shrink-0"
                      title={t('print_pdf')}
                    >
                      <span className="text-[12px] sm:text-[13px] font-medium">{t('print_pdf')}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(table);
                        }}
                        className="w-10 h-10 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-950 hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all shadow-sm active:scale-90 shrink-0"
                        title="Edit Table"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(table);
                        }}
                        className="w-10 h-10 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-950 hover:bg-rose-500 hover:text-white transition-all shadow-sm active:scale-90 hover:border-rose-500 shrink-0"
                        title="Delete Table"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <TableFormModal
        isOpen={isModalOpen}
        initialData={selectedTable ? { ...selectedTable, tenantSlug } : null}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleFormSubmit}
      />

      <GlobalActionDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setTableToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Table"
        description={`Are you sure you want to delete the table "${tableToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="DESTRUCTIVE"
      />

      <GlobalActionDialog
        isOpen={!!dialogMsg}
        title={dialogMsg?.title || "Notice"}
        description={dialogMsg?.message || ""}
        confirmLabel="OK"
        onConfirm={() => setDialogMsg(null)}
        onCancel={() => setDialogMsg(null)}
        variant={dialogMsg?.title === "Error" ? "DESTRUCTIVE" : "PRIMARY"}
      />
    </div>
  );
}
