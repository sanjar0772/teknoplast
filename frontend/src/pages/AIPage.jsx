import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Bot, User, AlertTriangle, TrendingUp, DollarSign, Factory, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { aiAPI } from '../services/api';

const SEVERITY_COLOR = {
  LOW: 'border-l-4 border-blue-400 bg-blue-50',
  MEDIUM: 'border-l-4 border-yellow-400 bg-yellow-50',
  HIGH: 'border-l-4 border-orange-400 bg-orange-50',
  CRITICAL: 'border-l-4 border-red-500 bg-red-50',
};

export default function AIPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('chat');
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: 'Salom! Men Teknoplast AI yordamchisiman. Biznes haqida istalgan savolingizni bering.', time: new Date() }
  ]);
  const chatEndRef = useRef(null);

  const { data: alerts } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => aiAPI.getAlerts().then(r => r.data),
    refetchInterval: 60000,
  });

  const { data: salaryAnalysis, isLoading: salaryLoading, refetch: refetchSalary } = useQuery({
    queryKey: ['ai-salary'],
    queryFn: () => aiAPI.getSalaryAnalysis().then(r => r.data),
    enabled: false,
  });

  const { data: salesForecast, isLoading: salesLoading, refetch: refetchSales } = useQuery({
    queryKey: ['ai-sales'],
    queryFn: () => aiAPI.getSalesForecast().then(r => r.data),
    enabled: false,
  });

  const { data: expenseOpt, isLoading: expenseLoading, refetch: refetchExpense } = useQuery({
    queryKey: ['ai-expense'],
    queryFn: () => aiAPI.getExpenseOptimization().then(r => r.data),
    enabled: false,
  });

  const dismissMutation = useMutation({
    mutationFn: (id) => aiAPI.dismissAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const chatMutation = useMutation({
    mutationFn: (question) => aiAPI.chat(question),
    onSuccess: (res) => {
      setChatMessages(prev => [...prev, {
        role: 'assistant', text: res.data.answer, time: new Date()
      }]);
    },
    onError: () => {
      setChatMessages(prev => [...prev, {
        role: 'assistant', text: 'Kechirasiz, xato yuz berdi. Qayta urinib ko\'ring.', time: new Date()
      }]);
    },
  });

  const sendMessage = () => {
    if (!message.trim()) return;
    setChatMessages(prev => [...prev, { role: 'user', text: message, time: new Date() }]);
    chatMutation.mutate(message);
    setMessage('');
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const TABS = [
    { id: 'chat', label: 'AI Chat', icon: Bot },
    { id: 'alerts', label: `Ogohlantirishlar (${alerts?.alerts?.length || 0})`, icon: AlertTriangle },
    { id: 'salary', label: 'Maosh Tahlili', icon: DollarSign },
    { id: 'sales', label: 'Sotuv Prognozi', icon: TrendingUp },
    { id: 'expense', label: 'Xarajat Optimallashtirish', icon: Factory },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">AI Yordamchi</h1>
        <span className="badge-blue flex items-center gap-1">
          <Bot size={12} /> Claude AI
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === id ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* CHAT */}
      {activeTab === 'chat' && (
        <div className="card p-0 flex flex-col" style={{ height: '65vh' }}>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Bot size={16} className="text-white" />
                  </div>
                )}
                <div className={`max-w-lg px-4 py-3 rounded-2xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                    {msg.time.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <User size={16} className="text-gray-600" />
                  </div>
                )}
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <Bot size={16} className="text-white" />
                </div>
                <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-tl-sm">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick questions */}
          <div className="px-6 pb-2 flex gap-2 flex-wrap">
            {['Bu oyda sotuv qancha?', 'Eng ko\'p sotiladigan mahsulot?', 'Oylik xarajat necha?'].map(q => (
              <button key={q} onClick={() => { setMessage(q); }}
                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100 transition">
                {q}
              </button>
            ))}
          </div>

          <div className="p-4 border-t border-gray-100">
            <div className="flex gap-3">
              <input value={message} onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Savolingizni yozing..."
                className="input flex-1" />
              <button onClick={sendMessage} disabled={chatMutation.isPending || !message.trim()}
                className="btn-primary w-10 h-10 p-0 flex items-center justify-center">
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALERTS */}
      {activeTab === 'alerts' && (
        <div className="space-y-3">
          {!(alerts?.alerts?.length) ? (
            <div className="card text-center py-12 text-gray-400">
              <AlertTriangle size={40} className="mx-auto mb-2 opacity-30" />
              <p>Ogohlantirish yo'q. Hammasi yaxshi!</p>
            </div>
          ) : alerts.alerts.map(a => (
            <div key={a.id} className={`card p-4 ${SEVERITY_COLOR[a.severity] || ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge ${
                      a.severity === 'CRITICAL' ? 'badge-red' :
                      a.severity === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                      a.severity === 'MEDIUM' ? 'badge-yellow' : 'badge-blue'
                    }`}>{a.severity}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(a.triggered_date).toLocaleString('uz-UZ')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800">{a.message}</p>
                </div>
                <button onClick={() => dismissMutation.mutate(a.id)}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SALARY ANALYSIS */}
      {activeTab === 'salary' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Maosh Tahlili (Claude AI)</h2>
            <button onClick={() => refetchSalary()} disabled={salaryLoading} className="btn-primary btn-sm">
              {salaryLoading ? 'Tahlil qilinmoqda...' : 'Tahlil qilish'}
            </button>
          </div>
          {salaryAnalysis ? (
            <div className="space-y-4">
              {salaryAnalysis.cached && (
                <p className="text-xs text-gray-400">* Keshdan olindi (1 soat davomida saqlanadi)</p>
              )}
              {(() => {
                const d = salaryAnalysis.analysis?.analysis_data;
                const parsed = typeof d === 'string' ? JSON.parse(d) : d;
                return (
                  <div className="space-y-3">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <h3 className="font-medium text-blue-900 mb-2">Xulosa</h3>
                      <p className="text-sm text-blue-800">{parsed?.summary}</p>
                    </div>
                    {parsed?.recommendations?.length > 0 && (
                      <div>
                        <h3 className="font-medium mb-2">Tavsiyalar</h3>
                        <ul className="space-y-2">
                          {parsed.recommendations.map((r, i) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-700">
                              <span className="text-green-500 mt-0.5">✓</span> {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <DollarSign size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Tahlil boshlash uchun tugmani bosing</p>
            </div>
          )}
        </div>
      )}

      {/* SALES FORECAST */}
      {activeTab === 'sales' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Sotuv Prognozi (Claude AI)</h2>
            <button onClick={() => refetchSales()} disabled={salesLoading} className="btn-primary btn-sm">
              {salesLoading ? 'Analizlanmoqda...' : 'Prognoz qilish'}
            </button>
          </div>
          {salesForecast ? (
            <div className="space-y-4">
              {(() => {
                const d = salesForecast.analysis?.analysis_data;
                const parsed = typeof d === 'string' ? JSON.parse(d) : d;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-green-50 rounded-lg p-4">
                        <p className="text-xs text-gray-500">Trend</p>
                        <p className="font-bold text-green-800">{parsed?.trend}</p>
                        <p className="text-sm text-green-700">{parsed?.trend_percentage}%</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4">
                        <p className="text-xs text-gray-500">Keyingi oy prognozi</p>
                        <p className="font-bold text-blue-800">{parsed?.next_month_forecast?.toLocaleString()} so'm</p>
                      </div>
                    </div>
                    {parsed?.insights && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-sm text-gray-700">{parsed.insights}</p>
                      </div>
                    )}
                    {parsed?.recommendations?.map((r, i) => (
                      <div key={i} className="flex gap-2 text-sm text-gray-700">
                        <span className="text-blue-500">→</span> {r}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <TrendingUp size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Prognoz boshlash uchun tugmani bosing</p>
            </div>
          )}
        </div>
      )}

      {/* EXPENSE OPTIMIZATION */}
      {activeTab === 'expense' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Xarajat Optimallashtirish (Claude AI)</h2>
            <button onClick={() => refetchExpense()} disabled={expenseLoading} className="btn-primary btn-sm">
              {expenseLoading ? 'Tahlil qilinmoqda...' : 'Tahlil qilish'}
            </button>
          </div>
          {expenseOpt ? (
            <div className="space-y-4">
              {(() => {
                const d = expenseOpt.analysis?.analysis_data;
                const parsed = typeof d === 'string' ? JSON.parse(d) : d;
                return (
                  <div className="space-y-3">
                    <div className="bg-orange-50 rounded-lg p-4">
                      <p className="text-sm text-orange-800">{parsed?.summary}</p>
                    </div>
                    {parsed?.savings_opportunities?.length > 0 && (
                      <div>
                        <h3 className="font-medium mb-2">Tejash imkoniyatlari</h3>
                        {parsed.savings_opportunities.map((s, i) => (
                          <div key={i} className="flex gap-2 text-sm text-gray-700 mb-1.5">
                            <span className="text-green-500">💡</span> {s}
                          </div>
                        ))}
                      </div>
                    )}
                    {parsed?.recommendations?.map((r, i) => (
                      <div key={i} className="flex gap-2 text-sm text-gray-700">
                        <span className="text-blue-500">→</span> {r}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <Factory size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Tahlil boshlash uchun tugmani bosing</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
