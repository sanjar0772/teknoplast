import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, User, AlertTriangle, TrendingUp, DollarSign, Factory, X, Mic, MicOff, Camera, Image, Volume2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { aiAPI } from '../services/api';

const SEVERITY_COLOR = {
  LOW: 'border-l-4 border-blue-400 bg-blue-50',
  MEDIUM: 'border-l-4 border-yellow-400 bg-yellow-50',
  HIGH: 'border-l-4 border-orange-400 bg-orange-50',
  CRITICAL: 'border-l-4 border-red-500 bg-red-50',
};

// Ahmad Avatar
function AhmadAvatar({ size = 32 }) {
  return (
    <div className={`w-${size/4} h-${size/4} bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center flex-shrink-0`}
      style={{ width: size, height: size }}>
      <span className="text-white font-bold" style={{ fontSize: size * 0.45 }}>A</span>
    </div>
  );
}

export default function AIPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('chat');
  const [message, setMessage] = useState('');
  const [language, setLanguage] = useState('uz');
  const [listening, setListening] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: language === 'uz'
      ? 'Assalomu alaykum! Men Ahmad — sizning yordamchingizman. Ovozli buyruq bering, rasm yuboring yoki savol yozing.'
      : 'Здравствуйте! Я Ахмад — ваш помощник. Дайте голосовую команду, отправьте фото или напишите вопрос.',
      time: new Date() }
  ]);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Alerts
  const { data: alerts } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => aiAPI.getAlerts().then(r => r.data),
    refetchInterval: 60000,
  });

  // Salary analysis
  const { data: salaryAnalysis, isLoading: salaryLoading, refetch: refetchSalary } = useQuery({
    queryKey: ['ai-salary'],
    queryFn: () => aiAPI.getSalaryAnalysis().then(r => r.data),
    enabled: false,
  });

  // Sales forecast
  const { data: salesForecast, isLoading: salesLoading, refetch: refetchSales } = useQuery({
    queryKey: ['ai-sales'],
    queryFn: () => aiAPI.getSalesForecast().then(r => r.data),
    enabled: false,
  });

  // Expense optimization
  const { data: expenseOpt, isLoading: expenseLoading, refetch: refetchExpense } = useQuery({
    queryKey: ['ai-expense'],
    queryFn: () => aiAPI.getExpenseOptimization().then(r => r.data),
    enabled: false,
  });

  const dismissMutation = useMutation({
    mutationFn: (id) => aiAPI.dismissAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  // Chat
  const chatMutation = useMutation({
    mutationFn: ({ question, lang }) => aiAPI.chat(question, lang),
    onSuccess: (res) => {
      const answer = res.data.answer;
      const newIdx = chatMessages.length + 1; // user xabaridan keyingi index
      setChatMessages(prev => [...prev, {
        role: 'assistant', text: answer, time: new Date()
      }]);
      // Javob tilini matndan aniqlab gapiramiz
      speak(answer, newIdx);

      // Agar tizimga qo'shish kerak bo'lsa
      if (res.data.action) {
        setPendingAction(res.data.action);
      }
    },
    onError: () => {
      const errMsg = language === 'uz'
        ? 'Kechirasiz, xato yuz berdi. Qayta urinib ko\'ring.'
        : 'Извините, произошла ошибка. Попробуйте снова.';
      setChatMessages(prev => [...prev, {
        role: 'assistant', text: errMsg, time: new Date()
      }]);
    },
  });

  // Image upload
  const imageMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('language', language);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/ahmad/read-image', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const answer = data.response || data.text || (language === 'uz' ? 'Rasmni o\'qib bo\'ldim.' : 'Изображение прочитано.');
      const newIdx = chatMessages.length + 1;
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        text: answer,
        time: new Date(),
        imageData: data.extracted,
      }]);
      speak(answer, newIdx);

      if (data.action) {
        setPendingAction(data.action);
      }
    },
    onError: () => {
      const errMsg = language === 'uz' ? 'Rasmni o\'qishda xato' : 'Ошибка чтения изображения';
      setChatMessages(prev => [...prev, {
        role: 'assistant', text: errMsg, time: new Date()
      }]);
    },
  });

  // Til avto-aniqlash — matn rus yoki o'zbek tilidami?
  const detectLang = (text) => {
    if (!text) return language;
    // Kirill harflari bo'lsa va o'zbek-kirill emas — rus tili
    const cyrillic = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
    const latin = (text.match(/[a-zA-Z]/g) || []).length;
    // O'zbekcha lotin belgilari (o', g', sh, ch) yoki ko'p lotin — o'zbek
    if (cyrillic > latin) return 'ru';
    return 'uz';
  };

  // Text-to-Speech — Ahmad ovozi (erkak, o'g'il bola)
  const [speakingMsgId, setSpeakingMsgId] = useState(null);
  const voicesRef = useRef([]);
  const speakStartRef = useRef(0); // speak boshlangan vaqt (klik konflikti uchun)

  // Ovozlarni oldindan yuklash (brauzer asinxron yuklaydi)
  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis?.getVoices() || [];
      if (v.length) voicesRef.current = v;
    };
    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Ahmad gapirayotganda — istalgan joyga BITTA klik to'xtatadi
  useEffect(() => {
    const stopOnClick = () => {
      if (!('speechSynthesis' in window)) return;
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) return;
      // speak endigina boshlangan bo'lsa (shu klik) — to'xtatmaymiz
      if (Date.now() - speakStartRef.current < 400) return;
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    };
    document.addEventListener('click', stopOnClick);
    return () => document.removeEventListener('click', stopOnClick);
  }, []);

  const speak = (text, msgId = null, forceLang = null) => {
    if (!('speechSynthesis' in window) || !text) return;

    // Agar hozir shu xabar gapirilayotgan bo'lsa — to'xtat (ikki marta bosish)
    if (speakingMsgId === msgId && msgId !== null) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    speakStartRef.current = Date.now(); // shu klik to'xtatmasligi uchun
    const spokenLang = forceLang || detectLang(text);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.7; // Yuqori pitch — o'g'il bola ovozi

    // Ovozlarni olamiz (ref yoki to'g'ridan-to'g'ri)
    let voices = voicesRef.current.length ? voicesRef.current : window.speechSynthesis.getVoices();

    // O'zbek ovozi kamdan-kam bor — shuning uchun: uz -> uz topilsa uz, bo'lmasa ru, u ham bo'lmasa default
    const uzVoices = voices.filter(v => v.lang.toLowerCase().startsWith('uz'));
    const ruVoices = voices.filter(v => v.lang.toLowerCase().startsWith('ru'));

    let pool;
    if (spokenLang === 'uz') {
      pool = uzVoices.length ? uzVoices : ruVoices; // uz yo'q bo'lsa ru ovozda gapiradi
    } else {
      pool = ruVoices.length ? ruVoices : voices;
    }

    // Erkak/bola ovozini afzal ko'ramiz
    const chosen = pool.find(v =>
      v.name.toLowerCase().includes('male') ||
      v.name.toLowerCase().includes('dmitr') ||
      v.name.toLowerCase().includes('pavel') ||
      v.name.toLowerCase().includes('artem')
    ) || pool[0];

    // MUHIM: utterance.lang ni TANLANGAN ovoz tiliga moslaymiz
    // (uz-UZ qo'ysak, lekin uz ovozi yo'q bo'lsa — brauzer JIM qoladi)
    if (chosen) {
      utterance.voice = chosen;
      utterance.lang = chosen.lang;
    } else {
      utterance.lang = spokenLang === 'uz' ? 'ru-RU' : 'ru-RU'; // xavfsiz fallback
    }

    setSpeakingMsgId(msgId);
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);

    // Chrome bug: ba'zan speak ishlamaydi — resume bilan turtki beramiz
    window.speechSynthesis.speak(utterance);
    setTimeout(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    }, 100);
  };

  // Speech-to-Text
  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error(language === 'uz' ? 'Brauzer ovozni qo\'llab-quvvatlamaydi' : 'Браузер не поддерживает голос');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'uz' ? 'uz-UZ' : 'ru-RU';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('');

      if (transcript.trim()) {
        const detectedLang = detectLang(transcript); // Foydalanuvchi qaysi tilda gapirdi
        setChatMessages(prev => [...prev, { role: 'user', text: transcript, time: new Date() }]);
        chatMutation.mutate({ question: transcript, lang: detectedLang });
      }
    };

    recognition.onerror = () => {
      setListening(false);
      toast.error(language === 'uz' ? 'Ovoz tanilmadi' : 'Голос не распознан');
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Image upload handler
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setChatMessages(prev => [...prev, {
      role: 'user',
      text: language === 'uz' ? `Rasm yuborildi: ${file.name}` : `Фото отправлено: ${file.name}`,
      time: new Date(),
      isImage: true,
      imageUrl: URL.createObjectURL(file),
    }]);

    imageMutation.mutate(file);
    e.target.value = '';
  };

  // Permission action
  const confirmAction = async (confirmed) => {
    if (!pendingAction) return;

    if (confirmed) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/ahmad/confirm-action', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: pendingAction }),
        });
        const data = await res.json();
        const successMsg = language === 'uz'
          ? `Tayyor! ${data.message || 'Tizimga qo\'shildi.'}`
          : `Готово! ${data.message || 'Добавлено в систему.'}`;
        setChatMessages(prev => [...prev, { role: 'assistant', text: successMsg, time: new Date() }]);
        speak(successMsg);
      } catch {
        const errMsg = language === 'uz' ? 'Xato yuz berdi' : 'Произошла ошибка';
        setChatMessages(prev => [...prev, { role: 'assistant', text: errMsg, time: new Date() }]);
      }
    } else {
      const cancelMsg = language === 'uz' ? 'Bekor qilindi.' : 'Отменено.';
      setChatMessages(prev => [...prev, { role: 'assistant', text: cancelMsg, time: new Date() }]);
    }

    setPendingAction(null);
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    const detectedLang = detectLang(message); // Yozgan til
    setChatMessages(prev => [...prev, { role: 'user', text: message, time: new Date() }]);
    chatMutation.mutate({ question: message, lang: detectedLang });
    setMessage('');
  };

  // Chat bo'sh joyiga ikki marta bosish — oxirgi Ahmad xabarini eshittirish/to'xtatish
  const handleChatDoubleClick = () => {
    // Oxirgi assistant xabarini topamiz
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === 'assistant' && chatMessages[i].text) {
        speak(chatMessages[i].text, i);
        break;
      }
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const TABS = [
    { id: 'chat', label: 'Ahmad Chat', icon: '🤖' },
    { id: 'alerts', label: `Ogohlantirishlar (${alerts?.alerts?.length || 0})`, icon: '⚠️' },
    { id: 'salary', label: 'Maosh Tahlili', icon: '💰' },
    { id: 'sales', label: 'Sotuv Prognozi', icon: '📈' },
    { id: 'expense', label: 'Xarajat Optimallashtirish', icon: '🏭' },
  ];

  const quickQuestions = language === 'uz'
    ? ['Bu oyda sotuv qancha?', 'Eng ko\'p sotiladigan mahsulot?', 'Omborda nechta mahsulot bor?']
    : ['Сколько продаж в этом месяце?', 'Самый продаваемый товар?', 'Сколько товаров на складе?'];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">Ahmad</h1>
        <div className="flex items-center gap-2">
          <select value={language} onChange={e => setLanguage(e.target.value)}
            className="text-sm border rounded-lg px-2 py-1">
            <option value="uz">O'zbek</option>
            <option value="ru">Русский</option>
          </select>
          <span className="badge bg-emerald-100 text-emerald-800 flex items-center gap-1">
            Ahmad
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(({ id, label, icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === id ? 'bg-white shadow text-emerald-700' : 'text-gray-600 hover:text-gray-900'
            }`}>
            <span>{icon}</span> {label}
          </button>
        ))}
      </div>

      {/* CHAT */}
      {activeTab === 'chat' && (
        <div className="card p-0 flex flex-col" style={{ height: '65vh' }}>
          <div className="flex-1 overflow-y-auto p-6 space-y-4" onDoubleClick={handleChatDoubleClick}
            title={language === 'uz' ? 'Bo\'sh joyga 2 marta bosing — oxirgi javobni eshitish' : 'Двойной клик — прослушать последний ответ'}>
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && <AhmadAvatar />}
                <div className={`max-w-lg px-4 py-3 rounded-2xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}>
                  {msg.isImage && msg.imageUrl && (
                    <img src={msg.imageUrl} alt="uploaded" className="max-w-xs rounded-lg mb-2" />
                  )}
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  {msg.role === 'assistant' && msg.text && (
                    <button onClick={() => speak(msg.text, i)}
                      className={`mt-1 transition-all ${speakingMsgId === i ? 'text-emerald-600 animate-pulse' : 'text-gray-400 hover:text-emerald-600'}`}
                      title={speakingMsgId === i ? (language === 'uz' ? 'To\'xtatish' : 'Остановить') : (language === 'uz' ? 'Eshitish (2 marta bosing — to\'xtatish)' : 'Прослушать (2 раза — стоп)')}>
                      <Volume2 size={14} />
                    </button>
                  )}
                  <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-emerald-200' : 'text-gray-400'}`}>
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

            {/* Pending action confirmation */}
            {pendingAction && (
              <div className="flex gap-3 justify-start">
                <AhmadAvatar />
                <div className="bg-yellow-50 border border-yellow-200 px-4 py-3 rounded-2xl rounded-tl-sm max-w-lg">
                  <p className="text-sm text-yellow-800 font-medium mb-2">
                    {language === 'uz' ? 'Tizimga qo\'shaylikmi?' : 'Добавить в систему?'}
                  </p>
                  <p className="text-sm text-yellow-700 mb-3">{pendingAction.description}</p>
                  <div className="flex gap-2">
                    <button onClick={() => confirmAction(true)}
                      className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                      {language === 'uz' ? 'Ha, qo\'sh' : 'Да, добавить'}
                    </button>
                    <button onClick={() => confirmAction(false)}
                      className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">
                      {language === 'uz' ? 'Yo\'q' : 'Нет'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(chatMutation.isPending || imageMutation.isPending) && (
              <div className="flex gap-3">
                <AhmadAvatar />
                <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-tl-sm">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce"
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
            {quickQuestions.map(q => (
              <button key={q} onClick={() => { setMessage(q); }}
                className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full hover:bg-emerald-100 transition">
                {q}
              </button>
            ))}
          </div>

          {/* Input area */}
          <div className="p-4 border-t border-gray-100">
            <div className="flex gap-2">
              {/* Voice button */}
              <button onClick={toggleListening}
                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${
                  listening
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-gray-100 text-gray-600 hover:bg-emerald-100 hover:text-emerald-700'
                }`}
                title={language === 'uz' ? 'Ovozli buyruq' : 'Голосовая команда'}>
                {listening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              {/* Image button */}
              <button onClick={() => fileInputRef.current?.click()}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-emerald-100 hover:text-emerald-700 transition-all"
                title={language === 'uz' ? 'Rasm yuborish (nakladnoy, chek)' : 'Отправить фото (накладная, чек)'}>
                <Camera size={18} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={handleImageUpload} />

              {/* Text input */}
              <input value={message} onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder={language === 'uz' ? 'Ahmad\'ga yozing...' : 'Напишите Ахмаду...'}
                className="input flex-1" />

              <button onClick={sendMessage} disabled={chatMutation.isPending || !message.trim()}
                className="btn-primary w-10 h-10 p-0 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700">
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
              <p>{language === 'uz' ? 'Ogohlantirish yo\'q. Hammasi yaxshi!' : 'Нет предупреждений. Все хорошо!'}</p>
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
            <h2 className="font-semibold">{language === 'uz' ? 'Maosh Tahlili (Ahmad)' : 'Анализ зарплат (Ахмад)'}</h2>
            <button onClick={() => refetchSalary()} disabled={salaryLoading} className="btn-primary btn-sm bg-emerald-600">
              {salaryLoading ? (language === 'uz' ? 'Tahlil qilinmoqda...' : 'Анализ...') : (language === 'uz' ? 'Tahlil qilish' : 'Анализировать')}
            </button>
          </div>
          {salaryAnalysis ? (
            <div className="space-y-4">
              {salaryAnalysis.cached && (
                <p className="text-xs text-gray-400">* {language === 'uz' ? 'Keshdan olindi' : 'Из кэша'}</p>
              )}
              {(() => {
                const d = salaryAnalysis.analysis?.analysis_data;
                const parsed = typeof d === 'string' ? JSON.parse(d) : d;
                return (
                  <div className="space-y-3">
                    <div className="bg-emerald-50 rounded-lg p-4">
                      <h3 className="font-medium text-emerald-900 mb-2">{language === 'uz' ? 'Xulosa' : 'Заключение'}</h3>
                      <p className="text-sm text-emerald-800">{parsed?.summary}</p>
                    </div>
                    {parsed?.recommendations?.length > 0 && (
                      <div>
                        <h3 className="font-medium mb-2">{language === 'uz' ? 'Tavsiyalar' : 'Рекомендации'}</h3>
                        <ul className="space-y-2">
                          {parsed.recommendations.map((r, i) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-700">
                              <span className="text-emerald-500 mt-0.5">&#10003;</span> {r}
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
              <p className="text-sm">{language === 'uz' ? 'Tahlil boshlash uchun tugmani bosing' : 'Нажмите кнопку для начала анализа'}</p>
            </div>
          )}
        </div>
      )}

      {/* SALES FORECAST */}
      {activeTab === 'sales' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{language === 'uz' ? 'Sotuv Prognozi (Ahmad)' : 'Прогноз продаж (Ахмад)'}</h2>
            <button onClick={() => refetchSales()} disabled={salesLoading} className="btn-primary btn-sm bg-emerald-600">
              {salesLoading ? (language === 'uz' ? 'Analizlanmoqda...' : 'Анализ...') : (language === 'uz' ? 'Prognoz qilish' : 'Прогнозировать')}
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
                      <div className="bg-emerald-50 rounded-lg p-4">
                        <p className="text-xs text-gray-500">Trend</p>
                        <p className="font-bold text-emerald-800">{parsed?.trend}</p>
                        <p className="text-sm text-emerald-700">{parsed?.trend_percentage}%</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4">
                        <p className="text-xs text-gray-500">{language === 'uz' ? 'Keyingi oy prognozi' : 'Прогноз на след. мес.'}</p>
                        <p className="font-bold text-blue-800">{parsed?.next_month_forecast?.toLocaleString()} {language === 'uz' ? "so'm" : 'сум'}</p>
                      </div>
                    </div>
                    {parsed?.insights && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-sm text-gray-700">{parsed.insights}</p>
                      </div>
                    )}
                    {parsed?.recommendations?.map((r, i) => (
                      <div key={i} className="flex gap-2 text-sm text-gray-700">
                        <span className="text-emerald-500">&rarr;</span> {r}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <TrendingUp size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{language === 'uz' ? 'Prognoz boshlash uchun tugmani bosing' : 'Нажмите для прогноза'}</p>
            </div>
          )}
        </div>
      )}

      {/* EXPENSE OPTIMIZATION */}
      {activeTab === 'expense' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{language === 'uz' ? 'Xarajat Optimallashtirish (Ahmad)' : 'Оптимизация расходов (Ахмад)'}</h2>
            <button onClick={() => refetchExpense()} disabled={expenseLoading} className="btn-primary btn-sm bg-emerald-600">
              {expenseLoading ? (language === 'uz' ? 'Tahlil qilinmoqda...' : 'Анализ...') : (language === 'uz' ? 'Tahlil qilish' : 'Анализировать')}
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
                        <h3 className="font-medium mb-2">{language === 'uz' ? 'Tejash imkoniyatlari' : 'Возможности экономии'}</h3>
                        {parsed.savings_opportunities.map((s, i) => (
                          <div key={i} className="flex gap-2 text-sm text-gray-700 mb-1.5">
                            <span className="text-emerald-500">&#128161;</span> {s}
                          </div>
                        ))}
                      </div>
                    )}
                    {parsed?.recommendations?.map((r, i) => (
                      <div key={i} className="flex gap-2 text-sm text-gray-700">
                        <span className="text-emerald-500">&rarr;</span> {r}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <Factory size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{language === 'uz' ? 'Tahlil boshlash uchun tugmani bosing' : 'Нажмите для анализа'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
