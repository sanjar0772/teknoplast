import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/employees.css';

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [formData, setFormData] = useState({
    name: '',
    type: 'ISHCHI',
    daily_tariff: '',
    hourly_tariff: '',
    phone: '',
    address: '',
    shift: 'ERTALAB',
  });

  const token = localStorage.getItem('token');
  const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
    headers: { Authorization: `Bearer ${token}` },
  });

  const employeeTypes = [
    { value: 'STANOKCHI', label: '⚙️ STANOKCHI (Mashina operatori)' },
    { value: 'DETALCHI', label: '👩‍🏭 DETALCHI (Detalchi)' },
    { value: 'ISHCHI', label: '👔 ISHCHI (Ish xodimi)' },
    { value: 'SHOFIR', label: '🚗 SHOFIR (Shofir)' },
    { value: 'OSHPAZ', label: '👨‍🍳 OSHPAZ (Oshpaz)' },
    { value: 'BOSHQA', label: '👤 BOSHQA (Boshqa)' },
  ];

  const shifts = [
    { value: 'ERTALAB', label: '🌅 ERTALAB (1-smena)' },
    { value: 'ASR', label: '🌤️ ASR (2-smena)' },
    { value: 'KECHA', label: '🌙 KECHA (3-smena)' },
  ];

  // Load employees
  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const params = {};
      if (typeFilter !== 'all') params.type = typeFilter;
      if (search) params.search = search;

      const res = await api.get('/employees', { params });
      setEmployees(res.data.employees || []);
    } catch (err) {
      alert('Xodimlarni yuklashda xato: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add/Update employee
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.type || !formData.daily_tariff) {
      alert('Barcha kerakli maydonlarni to\'ldiring!');
      return;
    }

    try {
      if (editingId) {
        // Update
        const res = await api.put(`/employees/${editingId}`, formData);
        alert('✅ Xodim yangilandi!');
        setEmployees(employees.map(e => e.id === editingId ? res.data.employee : e));
      } else {
        // Create
        const res = await api.post('/employees', formData);
        alert('✅ Xodim qo\'shildi!');
        setEmployees([...employees, res.data.employee]);
      }

      setFormData({
        name: '',
        type: 'ISHCHI',
        daily_tariff: '',
        hourly_tariff: '',
        phone: '',
        address: '',
        shift: 'ERTALAB',
      });
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      alert('❌ Xato: ' + err.response?.data?.error || err.message);
    }
  };

  // Edit employee
  const handleEdit = (emp) => {
    setFormData({
      name: emp.name,
      type: emp.type,
      daily_tariff: emp.daily_tariff || '',
      hourly_tariff: emp.hourly_tariff || '',
      phone: emp.phone || '',
      address: emp.address || '',
      shift: emp.shift || 'ERTALAB',
    });
    setEditingId(emp.id);
    setShowForm(true);
  };

  // Change status
  const toggleStatus = async (emp) => {
    try {
      const res = await api.put(`/employees/${emp.id}`, {
        ...emp,
        is_active: emp.is_active ? 0 : 1,
      });
      setEmployees(employees.map(e => e.id === emp.id ? res.data.employee : e));
      alert(emp.is_active ? '⏹️ Faolligi o\'chirildi' : '✅ Faollashtirish');
    } catch (err) {
      alert('❌ Xato: ' + err.message);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [search, typeFilter]);

  return (
    <div className="employees-container">
      <div className="header">
        <h1>👥 ISHCHILAR BOSHQARUVI</h1>
        <p>Barcha xodimlarni qo'shish, tahrirlash va boshqarish</p>
      </div>

      {/* FILTER & CONTROLS */}
      <div className="controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Ism bo'yicha qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="filter-select">
          <option value="all">📊 Barcha turlar</option>
          <option value="STANOKCHI">⚙️ STANOKCHI</option>
          <option value="DETALCHI">👩‍🏭 DETALCHI</option>
          <option value="ISHCHI">👔 ISHCHI</option>
          <option value="SHOFIR">🚗 SHOFIR</option>
          <option value="OSHPAZ">👨‍🍳 OSHPAZ</option>
        </select>

        <button onClick={() => { setShowForm(true); setEditingId(null); setFormData({
          name: '', type: 'ISHCHI', daily_tariff: '', hourly_tariff: '', phone: '', address: '', shift: 'ERTALAB',
        }); }} className="btn-add">
          ➕ Xodim Qo'shish
        </button>
      </div>

      {/* STATISTICS */}
      <div className="stats">
        <div className="stat-card">
          <span className="label">Jami xodim</span>
          <span className="value">{employees.length}</span>
        </div>
        <div className="stat-card">
          <span className="label">Faol</span>
          <span className="value">{employees.filter(e => e.is_active).length}</span>
        </div>
        <div className="stat-card">
          <span className="label">Nofaol</span>
          <span className="value">{employees.filter(e => !e.is_active).length}</span>
        </div>
      </div>

      {/* EMPLOYEES TABLE */}
      <div className="table-wrapper">
        {loading ? (
          <div className="loading">Yuklanmoqda... ⏳</div>
        ) : employees.length === 0 ? (
          <div className="empty">
            <p>Xodimlar topilmadi 🔍</p>
          </div>
        ) : (
          <table className="employees-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Ism</th>
                <th>Tur</th>
                <th>Kunlik tarif</th>
                <th>Telefon</th>
                <th>Smena</th>
                <th>Status</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp, i) => (
                <tr key={emp.id} className={emp.is_active ? 'active' : 'inactive'}>
                  <td>{i + 1}</td>
                  <td className="name">
                    <strong>{emp.name}</strong>
                  </td>
                  <td>
                    <span className="badge badge-type">
                      {employeeTypes.find(t => t.value === emp.type)?.label || emp.type}
                    </span>
                  </td>
                  <td className="number">
                    {emp.daily_tariff?.toLocaleString('uz-UZ')} UZS
                  </td>
                  <td className="phone">{emp.phone || '-'}</td>
                  <td>
                    <span className="badge badge-shift">
                      {shifts.find(s => s.value === emp.shift)?.label || emp.shift || '-'}
                    </span>
                  </td>
                  <td>
                    <span className={`status ${emp.is_active ? 'active' : 'inactive'}`}>
                      {emp.is_active ? '✅ Faol' : '⏹️ Nofaol'}
                    </span>
                  </td>
                  <td className="actions">
                    <button onClick={() => handleEdit(emp)} className="btn-edit">
                      ✏️ Tahrir
                    </button>
                    <button onClick={() => toggleStatus(emp)} className={`btn-toggle ${emp.is_active ? 'btn-disable' : 'btn-enable'}`}>
                      {emp.is_active ? '⏹️' : '▶️'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* FORM MODAL */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? '✏️ Xodimni Tahrir' : '➕ Yangi Xodim Qo\'shish'}</h2>

            <form onSubmit={handleSubmit} className="employee-form">
              <div className="form-group">
                <label>Ism *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="To'liq ism"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Tur *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  >
                    {employeeTypes.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Smena</label>
                  <select
                    value={formData.shift}
                    onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                  >
                    {shifts.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Kunlik Tarif (UZS) *</label>
                  <input
                    type="number"
                    value={formData.daily_tariff}
                    onChange={(e) => setFormData({ ...formData, daily_tariff: e.target.value })}
                    placeholder="0"
                  />
                </div>

                <div className="form-group">
                  <label>Soat Tarifi (UZS)</label>
                  <input
                    type="number"
                    value={formData.hourly_tariff}
                    onChange={(e) => setFormData({ ...formData, hourly_tariff: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Telefon</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+998901234567"
                />
              </div>

              <div className="form-group">
                <label>Manzil</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Manzil"
                />
              </div>

              <div className="form-buttons">
                <button type="submit" className="btn-save">
                  ✅ {editingId ? 'Yangilash' : 'Qo\'shish'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-cancel">
                  ❌ Bekor Qilish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
