import { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import toast from 'react-hot-toast';
import { Save, RotateCcw, Download, Trash2, Filter } from 'lucide-react';
import { productsAPI } from '../services/api';
import useAuthStore from '../store/authStore';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const COLOR_OPTIONS = ['oq', 'shaffof', "ko'k", 'qizil', 'yashil', 'sariq', 'qora', 'kulrang'];
const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(parseFloat(n || 0)));

export default function SmartProductsPage() {
  const { isOwner } = useAuthStore();
  const qc = useQueryClient();
  const gridRef = useRef(null);
  const [dirty, setDirty] = useState(new Map());
  const [selectedIds, setSelectedIds] = useState([]);

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'smart'],
    queryFn: () => productsAPI.getAll({ is_active: 'all' }).then(r => r.data),
  });

  // Guruhlar yonma-yon turishi uchun: base_name -> razmer -> rang bo'yicha saralash
  const rows = useMemo(() => {
    const list = [...(data?.products || [])];
    list.sort((a, b) => {
      const bn = (a.base_name || a.name || '').localeCompare(b.base_name || b.name || '');
      if (bn !== 0) return bn;
      const rz = (a.razmer || '').localeCompare(b.razmer || '');
      if (rz !== 0) return rz;
      return (a.rang || '').localeCompare(b.rang || '');
    });
    return list;
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (updates) => productsAPI.updateBulk(updates),
    onSuccess: (res) => {
      toast.success(`✅ ${res.data.count} ta qator saqlandi`);
      setDirty(new Map());
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => productsAPI.bulkDelete(ids),
    onSuccess: (res) => {
      toast.success(`🗑 ${res.data.count} ta mahsulot olib tashlandi`);
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const onCellValueChanged = useCallback((event) => {
    const { data: row, colDef, oldValue, newValue } = event;
    if (oldValue === newValue) return;
    setDirty(prev => {
      const next = new Map(prev);
      const existing = next.get(row.id) || { id: row.id };
      existing[colDef.field] = newValue;
      next.set(row.id, existing);
      return next;
    });
    // Jami ustunini yangilash uchun qatorni refresh
    event.api.refreshCells({ rowNodes: [event.node], columns: ['jami'], force: true });
  }, []);

  const onSelectionChanged = useCallback(() => {
    setSelectedIds(gridRef.current.api.getSelectedRows().map(r => r.id));
  }, []);

  const saveAll = () => {
    if (!dirty.size) return toast('O\'zgarish yo\'q');
    saveMutation.mutate([...dirty.values()]);
  };
  const discardAll = () => {
    setDirty(new Map());
    qc.invalidateQueries({ queryKey: ['products'] });
    toast('O\'zgarishlar bekor qilindi');
  };
  const onBulkDelete = () => {
    if (!selectedIds.length) return toast.error('Hech narsa belgilanmagan');
    if (confirm(`${selectedIds.length} ta mahsulot olib tashlansinmi?`)) {
      bulkDeleteMutation.mutate(selectedIds);
    }
  };
  const exportCsv = () => {
    gridRef.current.api.exportDataAsCsv({
      fileName: `mahsulotlar-${new Date().toISOString().slice(0,10)}.csv`,
      columnKeys: ['base_name', 'razmer', 'rang', 'stock_quantity', 'price'],
    });
  };

  // Bir xil bo'lsa katakni bo'sh ko'rsatish (Excel "merge" ko'rinishi)
  const groupRenderer = (groupFields) => (p) => {
    const i = p.node.rowIndex;
    if (i != null && p.api) {
      const prev = p.api.getDisplayedRowAtIndex(i - 1);
      if (prev && prev.data && groupFields.every(f => prev.data[f] === p.data[f])) {
        return ''; // yuqoridagi qator bilan bir xil — takrorlamaymiz
      }
    }
    return p.value;
  };

  const columnDefs = useMemo(() => [
    {
      headerCheckboxSelection: true, checkboxSelection: true,
      width: 42, pinned: 'left', sortable: false, filter: false, resizable: false, headerName: '',
    },
    {
      field: 'base_name', headerName: 'Mahsulot nomi', minWidth: 220, flex: 2,
      editable: true, filter: 'agTextColumnFilter',
      cellRenderer: groupRenderer(['base_name']),
      cellStyle: { fontWeight: 600, color: '#111827' },
    },
    {
      field: 'razmer', headerName: 'Razmer', width: 120,
      editable: true, filter: 'agTextColumnFilter',
      cellRenderer: groupRenderer(['base_name', 'razmer']),
      cellStyle: { color: '#374151' },
    },
    {
      field: 'rang', headerName: 'Rang', width: 120, editable: true, filter: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: COLOR_OPTIONS },
    },
    {
      field: 'stock_quantity', headerName: 'Miqdor', width: 110, editable: true,
      filter: 'agNumberColumnFilter', type: 'numericColumn',
      valueParser: p => parseInt(p.newValue) || 0,
      cellStyle: p => ({
        textAlign: 'right',
        color: p.value < 10 ? '#dc2626' : p.value < 50 ? '#ea580c' : '#16a34a',
        fontWeight: 600,
      }),
    },
    {
      field: 'price', headerName: 'Narx (so\'m)', width: 130, editable: true,
      filter: 'agNumberColumnFilter', type: 'numericColumn',
      valueFormatter: p => p.value != null ? fmt(p.value) : '',
      valueParser: p => Number(p.newValue) || 0,
      cellStyle: { textAlign: 'right', color: '#1d4ed8', fontWeight: 600 },
    },
    {
      colId: 'jami', headerName: 'Jami (qiymat)', width: 150,
      editable: false, sortable: false, filter: false, type: 'numericColumn',
      valueGetter: p => (parseFloat(p.data.stock_quantity) || 0) * (parseFloat(p.data.price) || 0),
      valueFormatter: p => fmt(p.value),
      cellStyle: { textAlign: 'right', color: '#6b7280', fontWeight: 700, background: '#f9fafb' },
    },
    {
      field: 'is_active', headerName: 'Faol', width: 80, editable: true,
      cellEditor: 'agCheckboxCellEditor',
      cellRenderer: p => p.value ? '✅' : '⛔',
    },
  ], []);

  const defaultColDef = useMemo(() => ({
    sortable: true, resizable: true, filter: true, floatingFilter: true,
  }), []);

  // Guruh boshlanishida tepa chiziq + dirty sariq fon
  const getRowStyle = useCallback((params) => {
    const i = params.node.rowIndex;
    let style = {};
    if (i != null && params.api) {
      const prev = params.api.getDisplayedRowAtIndex(i - 1);
      const isStart = !prev || !prev.data || prev.data.base_name !== params.data.base_name;
      if (isStart && i !== 0) style.borderTop = '2px solid #cbd5e1';
    }
    if (dirty.has(params.data?.id)) style.background = '#fef9c3';
    return style;
  }, [dirty]);

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mahsulotlar — Smart Grid</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Bir xil nom + razmer takrorlanmaydi (faqat rang farqi) · Katakni 2-marta bosing yoki <kbd>Enter</kbd>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {dirty.size > 0 && (
            <>
              <span className="badge-yellow self-center">{dirty.size} ta o'zgarish</span>
              <button onClick={discardAll} className="btn-secondary btn-sm"><RotateCcw size={13} /> Bekor</button>
              <button onClick={saveAll} disabled={saveMutation.isPending} className="btn-success btn-sm">
                <Save size={13} /> {saveMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </>
          )}
          {selectedIds.length > 0 && isOwner() && (
            <button onClick={onBulkDelete} className="btn-danger btn-sm">
              <Trash2 size={13} /> O'chirish ({selectedIds.length})
            </button>
          )}
          <button onClick={exportCsv} className="btn-secondary btn-sm"><Download size={13} /> CSV</button>
        </div>
      </div>

      <div className="card p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Filter size={14} />
          Jami: <strong className="text-gray-900">{rows.length}</strong> ta mahsulot
          {dirty.size > 0 && <span className="text-yellow-700">· {dirty.size} ta saqlanmagan</span>}
        </div>
        <input type="text" placeholder="Tezkor qidiruv..."
          onChange={e => gridRef.current?.api.setGridOption('quickFilterText', e.target.value)}
          className="input w-72 text-sm" />
      </div>

      <div className="ag-theme-quartz" style={{ height: 'calc(100vh - 240px)', minHeight: '500px', width: '100%' }}>
        <AgGridReact
          ref={gridRef}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onCellValueChanged={onCellValueChanged}
          onSelectionChanged={onSelectionChanged}
          rowSelection="multiple"
          suppressRowClickSelection
          stopEditingWhenCellsLoseFocus
          enableCellTextSelection
          getRowStyle={getRowStyle}
          loading={isLoading}
          rowHeight={34}
          headerHeight={38}
          rowBuffer={20}
        />
      </div>
    </div>
  );
}
