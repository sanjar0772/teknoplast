import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/salaries.css';

const Salaries = () => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [salaries, salariesSet] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedSalary, setSelectedSalary] = useState(null);
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [adjustData, setAdjustData] = useState({ bonuses: 0, penalties: 0, notes: '' });

  const token = localStorage.getItem('token');
  const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
    headers: { Authorization: `Bearer ${token}` },
  });

  // Oylik ro'yxatini yuklash
  const fetchSalaries = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/salaries/?month=${month}`);
      salariesSet(res.data.salaries);
      setSummary(res.data.summary);
    } catch (err) {
      console.error('Xato:', err);
      alert('Oylik yuklashda xato');
    } finally {
      setLoading(false);
    }
  };

  // Oylik hisoblash
  const calculateSalaries = async () => {
    if (!window.confirm(`${month} oy uchun oylik hisoblashni tasdiqlang?`)) return;
    try {
      setLoading(true);
      const res = await api.post('/salaries/calculate', {
        month,
        tax_rate: 0.05,
        social_rate: 0.03,
      });
      alert(`✅ ${res.data.summary.total_employees} xodim uchun oylik hisoblandi!`);
      fetchSalaries();
    } catch (err) {
      alert(`❌ Xato: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Bonus/jarima qo'shish
  const adjustSalary = async () => {
    try {
      await api.put(`/salaries/${selectedSalary.id}/adjust`, adjustData);
      alert('✅ Oylik yangilandi');
      setShowAdjustForm(false);
      fetchSalaries();
    } catch (err) {
      alert(`❌ Xato: ${err.response?.data?.error}`);
    }
  };

  // Tasdiqlash
  const approveSalary = async (id) => {
    if (!window.confirm('Oylikni tasdiqlashni tasdiqlang?')) return;
    try {
      await api.put(`/salaries/${id}/approve`);
      alert('✅ Oylik tasdiqlandi');
      fetchSalaries();
    } catch (err) {
      alert(`❌ Xato: ${err.response?.data?.error}`);
    }
  };

  // To'lash
  const paySalary = async (id) => {
    if (!window.confirm('Oylik to\'landimi?')) return;
    try {
      await api.put(`/salaries/${id}/pay`);
      alert('✅ Oylik to\'landi');
      fetchSalaries();
    } catch (err) {
      alert(`❌ Xato: ${err.response?.data?.error}`);
    }
  };

  // Salary slip ko'rish
  const viewSlip = (id) => {
    window.open(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/salary-slip/${id}`, '_blank');
  };

  useEffect(() => {
    fetchSalaries();
  }, [month]);

  if (loading && !salaries.length) {
    return <div className="loading">Yuklanmoqda... ⏳</div>;
  }

  return (
    <div className="salaries-container">
      <div className="header">
        <h1>💰 OYLIK HISOBLASH</h1>
        <p>Barcha 36 xodim uchun oylik boshqaruv</p>
      </div>

      {/* CONTROL PANEL */}
      <div className="control-panel">
        <div className="month-picker">
          <label>Oyni tanlang:</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>

        <div className="buttons">
          <button onClick={fetchSalaries} disabled={loading} className="btn-primary">
            🔄 Yangilash
          </button>
          <button onClick={calculateSalaries} disabled={loading} className="btn-success">
            🧮 Oylik Hisoblash
          </button>
        </div>
      </div>

      {/* SUMMARY */}
      {summary && (
        <div className="summary-panel">
          <h2>📊 {month} Oy Jamlanmasi</h2>
          <div className="summary-grid">
            <div className="summary-card">
              <span className="label">Jami Xodim</span>
              <span className="value">{summary.total_employees}</span>
            </div>
            <div className="summary-card">
              <span className="label">Brutto</span>
              <span className="value">{parseInt(summary.total_amount).toLocaleString('uz-UZ')} UZS</span>
            </div>
            <div className="summary-card">
              <span className="label">Netto</span>
              <span className="value highlight">{salaries.reduce((s, r) => s + (r.net_amount || 0), 0).toLocaleString('uz-UZ')} UZS</span>
            </div>
            <div className="summary-card">
              <span className="label">To'landi</span>
              <span className="value paid">{summary.paid_count}</span>
            </div>
            <div className="summary-card">
              <span className="label">Tasdiqlandi</span>
              <span className="value">{summary.approved_count}</span>
            </div>
            <div className="summary-card">
              <span className="label">Hisoblandi</span>
              <span className="value">{summary.calculated_count}</span>
            </div>
          </div>
        </div>
      )}

      {/* SALARIES TABLE */}
      <div className="table-container">
        <h2>📋 Oylik Ro'yxati</h2>
        {salaries.length === 0 ? (
          <div className="empty-state">
            <p>Hali oylik hisoblangan yo'q. 🧮 "Oylik Hisoblash" tugmasini bosing</p>
          </div>
        ) : (
          <table className="salaries-table">
            <thead>
              <tr>
                <th>#</th>
                <th>FIO</th>
                <th>Tur</th>
                <th>Brutto</th>
                <th>Soliq</th>
                <th>Sug'urta</th>
                <th>Netto</th>
                <th>Holat</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {salaries.map((s, i) => (
                <tr key={s.id} className={`status-${s.status.toLowerCase()}`}>
                  <td>{i + 1}</td>
                  <td className="bold">{s.employee_name}</td>
                  <td><span className="badge">{s.employee_type}</span></td>
                  <td className="number">{parseInt(s.total_calculated).toLocaleString('uz-UZ')}</td>
                  <td className="number deduction">-{parseInt(s.tax_amount || 0).toLocaleString('uz-UZ')}</td>
                  <td className="number deduction">-{parseInt(s.social_security || 0).toLocaleString('uz-UZ')}</td>
                  <td className="number highlight bold">{parseInt(s.net_amount).toLocaleString('uz-UZ')}</td>
                  <td>
                    <span className={`status-badge status-${s.status.toLowerCase()}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="actions">
                    <button onClick={() => viewSlip(s.id)} className="btn-small btn-view">
                      📄 Slip
                    </button>
                    {s.status === 'CALCULATED' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedSalary(s);
                            setShowAdjustForm(true);
                          }}
                          className="btn-small btn-edit"
                        >
                          ✏️ Surash
                        </button>
                        <button
                          onClick={() => approveSalary(s.id)}
                          className="btn-small btn-approve"
                        >
                          ✅ Tasdiqlash
                        </button>
                      </>
                    )}
                    {s.status === 'APPROVED' && (
                      <button onClick={() => paySalary(s.id)} className="btn-small btn-pay">
                        💳 To'lash
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ADJUST FORM */}
      {showAdjustForm && selectedSalary && (
        <div className="modal-overlay" onClick={() => setShowAdjustForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Oylikni Surash - {selectedSalary.employee_name}</h2>
            <div className="form-group">
              <label>Bonus (UZS):</label>
              <input
                type="number"
                value={adjustData.bonuses}
                onChange={(e) => setAdjustData({ ...adjustData, bonuses: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Jarima (UZS):</label>
              <input
                type="number"
                value={adjustData.penalties}
                onChange={(e) => setAdjustData({ ...adjustData, penalties: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Eslatma:</label>
              <textarea
                value={adjustData.notes}
                onChange={(e) => setAdjustData({ ...adjustData, notes: e.target.value })}
                placeholder="Eslatma yozib qoldiring"
              />
            </div>
            <div className="form-buttons">
              <button onClick={adjustSalary} className="btn-success">
                ✅ Saqlash
              </button>
              <button onClick={() => setShowAdjustForm(false)} className="btn-cancel">
                ❌ Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Salaries;
