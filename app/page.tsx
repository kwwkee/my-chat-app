"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Smile, Image as ImageIcon, FileText, Send, Mic, ChevronLeft, Search, MoreVertical } from 'lucide-react';
import { supabase } from '@/lib/supabase'; // Проверь путь к файлу (обычно @/lib/...)

type Message = {
  id: string;
  text: string | null;
  sender: 'me' | 'other';
  type: 'text' | 'image';
  image_url: string | null;
  created_at: string;
};

export default function ChatPage() {
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [showAttachments, setShowAttachments] = useState(false);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. ЗАГРУЗКА И REALTIME
  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });
      if (data) setChatHistory(data as Message[]);
      if (error) console.error("Ошибка загрузки:", error.message);
    };

    fetchMessages();

    // Слушаем базу в реальном времени
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMessage = payload.new as Message;
        setChatHistory(prev => {
          // Проверка на дубликаты (чтобы не двоилось у отправителя)
          const exists = prev.some(m => m.id === newMessage.id || 
            (m.text === newMessage.text && m.image_url === newMessage.image_url && m.sender === 'me' && 
             Math.abs(new Date(m.created_at).getTime() - new Date(newMessage.created_at).getTime()) < 2000));
          
          if (exists) return prev;
          return [...prev, newMessage];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Автоскролл вниз
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // 2. ОТПРАВКА СООБЩЕНИЯ
  const handleSend = async (content: string, type: 'text' | 'image' = 'text') => {
    if (!content.trim() && type === 'text') return;

    // Оптимистичное обновление (рисуем сразу у себя)
    const tempId = Date.now().toString();
    const optimisticMsg: Message = {
      id: tempId,
      text: type === 'text' ? content : null,
      image_url: type === 'image' ? content : null,
      type: type,
      sender: 'me',
      created_at: new Date().toISOString()
    };
    setChatHistory(prev => [...prev, optimisticMsg]);
    setMessage("");
    setShowAttachments(false);

    // Отправка в базу
    const { error } = await supabase.from('messages').insert([
      { 
        text: optimisticMsg.text, 
        image_url: optimisticMsg.image_url, 
        type: type, 
        sender: 'me' 
      }
    ]);

    if (error) console.error("Ошибка базы:", error.message);
  };

  // 3. ОБРАБОТКА ФОТО (Пока локально, без Storage)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    // 1. Генерируем уникальное имя файла
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    // 2. Загружаем файл в Supabase Storage
    const { data, error: uploadError } = await supabase.storage
      .from('chat-images')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // 3. Получаем публичную прямую ссылку на фото
    const { data: { publicUrl } } = supabase.storage
      .from('chat-images')
      .getPublicUrl(filePath);

    // 4. Отправляем эту ссылку как сообщение в чат
    handleSend(publicUrl, 'image');

  } catch (error) {
    console.error('Ошибка загрузки фото:', error);
    alert('Не удалось загрузить фото');
  }
};

  return (
    <div className="flex h-[100dvh] bg-[#0e1621] text-white overflow-hidden font-sans select-none">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />

      {/* ЛЕВАЯ ПАНЕЛЬ */}
      <aside className={`${selectedChat !== null ? 'hidden' : 'flex'} md:flex w-full md:w-[350px] border-r border-gray-900 flex-col bg-[#17212b]`}>
        <div className="p-4 flex items-center gap-3">
          <div className="p-2 hover:bg-gray-700 rounded-full cursor-pointer text-gray-400">☰</div>
          <div className="flex-1 bg-[#0e1621] rounded-full flex items-center px-3 py-1.5 border border-transparent focus-within:border-blue-500 transition-all">
            <Search size={16} className="text-gray-500" />
            <input placeholder="Поиск" className="bg-transparent border-none focus:ring-0 ml-2 w-full text-sm outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
           <div onClick={() => setSelectedChat(1)} className={`flex items-center p-3 cursor-pointer ${selectedChat === 1 ? 'bg-[#2b5278]' : 'hover:bg-[#202b36]'}`}>
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 mr-3 flex items-center justify-center font-bold shadow-lg text-lg">U</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center"><span className="font-bold text-sm">Общий чат</span><span className="text-[10px] text-gray-500">18:42</span></div>
                <p className="text-xs text-blue-400 truncate font-medium">Realtime включен ⚡</p>
              </div>
           </div>
        </div>
      </aside>

      {/* ПРАВАЯ ПАНЕЛЬ */}
      <main className={`${selectedChat === null ? 'hidden' : 'flex'} md:flex flex-1 flex-col relative bg-[#0e1621]`}>
        {selectedChat ? (
          <>
            <header className="h-14 px-4 bg-[#17212b]/95 backdrop-blur-md flex items-center justify-between border-b border-gray-900 z-20">
              <div className="flex items-center">
                <button onClick={() => setSelectedChat(null)} className="md:hidden mr-2 text-blue-400"><ChevronLeft size={28} /></button>
                <div className="w-9 h-9 bg-blue-500 rounded-full mr-3 flex items-center justify-center font-bold">U</div>
                <div><div className="font-bold text-[14px]">Общий чат</div><div className="text-[10px] text-blue-400">в сети</div></div>
              </div>
              <MoreVertical size={20} className="text-gray-400 cursor-pointer hover:text-white transition-colors" />
            </header>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-fixed opacity-95 custom-scrollbar">
              {chatHistory.map((msg) => {
                const isImg = msg.type === 'image' || (msg.image_url && msg.image_url.length > 5);
                return (
                  <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1`}>
                    <div className={`relative max-w-[85%] sm:max-w-[70%] shadow-xl ${isImg ? 'p-1 rounded-xl' : 'px-3 py-1.5 rounded-2xl'} ${msg.sender === 'me' ? 'bg-[#2b5278] rounded-tr-none' : 'bg-[#182533] rounded-tl-none'}`}>
                      {isImg ? (
                        <div className="relative">
                          <img src={msg.image_url || ''} alt="img" className="rounded-lg max-h-80 object-cover min-w-[100px]" />
                          <div className="absolute bottom-1 right-2 bg-black/40 px-1 rounded text-[9px] text-white">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-[15px] pr-10 break-words leading-relaxed">{msg.text}</p>
                          <div className="absolute bottom-1 right-2 flex items-center gap-1">
                            <span className="text-[9px] text-gray-300 opacity-60">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.sender === 'me' && <span className="text-blue-300 text-[10px] font-bold">✓✓</span>}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {showAttachments && (
              <div className="absolute bottom-20 left-4 bg-[#1c242f] border border-gray-800 rounded-2xl p-4 shadow-2xl flex gap-6 z-30 animate-in zoom-in-95 duration-200">
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1 hover:scale-110 transition-transform">
                  <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-lg"><ImageIcon size={22}/></div>
                  <span className="text-[11px] font-medium text-gray-300">Галерея</span>
                </button>
              </div>
            )}

            <footer className="p-3 bg-[#17212b] border-t border-gray-900">
              <form onSubmit={(e) => { e.preventDefault(); handleSend(message); }} className="max-w-5xl mx-auto flex items-end gap-2">
                <button type="button" onClick={() => setShowAttachments(!showAttachments)} className={`p-2 transition-all ${showAttachments ? 'text-blue-400 rotate-45' : 'text-gray-400 hover:text-blue-400'}`}>
                  <Paperclip size={24} />
                </button>
                <div className="flex-1 bg-[#0e1621] rounded-2xl flex items-center px-4 min-h-[44px] border border-gray-800 focus-within:border-gray-700">
                  <input 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Сообщение"
                    className="flex-1 bg-transparent border-none focus:ring-0 py-2 text-[16px] outline-none"
                  />
                  <Smile size={22} className="text-gray-400 cursor-pointer hover:text-white" />
                </div>
                <button type="submit" className="w-11 h-11 bg-blue-500 rounded-full flex items-center justify-center hover:bg-blue-600 active:scale-90 transition-all shadow-lg flex-shrink-0">
                  {message.trim() ? <Send size={20} /> : <Mic size={22} />}
                </button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 italic">
             <div className="w-20 h-20 bg-gray-900 rounded-full flex items-center justify-center mb-4 opacity-20 text-4xl">💬</div>
             <p className="text-sm">Выберите чат для общения</p>
          </div>
        )}
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2b5278; border-radius: 10px; }
      `}</style>
    </div>
  );
}