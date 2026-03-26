"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Smile, Image as ImageIcon, Send, Mic, ChevronLeft, Search, MoreVertical, X, LogOut, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Message = {
  id: string;
  text: string | null;
  from_id: string;
  to_id: string;
  type: 'text' | 'image';
  image_url: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  username: string;
};

export default function ChatPage() {
  const [user, setUser] = useState<any>(null);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  // Состояния чата
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [recentChats, setRecentChats] = useState<Profile[]>([]);
  const [message, setMessage] = useState("");
  const [showAttachments, setShowAttachments] = useState(false);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. АВТОРИЗАЦИЯ
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchMyProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchMyProfile(session.user.id);
      else { setMyProfile(null); setRecentChats([]); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchMyProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setMyProfile(data);
  };

  // 2. ЗАГРУЗКА СООБЩЕНИЙ
  useEffect(() => {
    if (!user || !selectedUser) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(from_id.eq.${user.id},to_id.eq.${selectedUser.id}),and(from_id.eq.${selectedUser.id},to_id.eq.${user.id})`)
        .order('created_at', { ascending: true });
      if (data) setChatHistory(data as Message[]);
    };

    fetchMessages();

    const channel = supabase.channel(`chat-${selectedUser.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMessage = payload.new as Message;
        if ((newMessage.from_id === user.id && newMessage.to_id === selectedUser.id) || 
            (newMessage.from_id === selectedUser.id && newMessage.to_id === user.id)) {
          setChatHistory(prev => [...prev, newMessage]);
        }
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, selectedUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // 3. ОБРАБОТКА ДЕЙСТВИЙ
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return alert(error.message);
      if (data.user) {
        const { error: pError } = await supabase.from('profiles').insert([{ id: data.user.id, username: usernameInput }]);
        if (pError) alert("Ошибка профиля: " + pError.message);
      }
      alert("Готово! Войдите в систему.");
      setIsRegistering(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }
  };

  const handleSearchUser = async () => {
    if (!searchQuery.trim()) return;
    const { data } = await supabase.from('profiles').select('*').eq('username', searchQuery.trim()).single();
    if (data) {
      if (data.id === user.id) return alert("Это вы :)");
      setSelectedUser(data);
      if (!recentChats.find(c => c.id === data.id)) setRecentChats([data, ...recentChats]);
      setSearchQuery("");
    } else alert("Пользователь не найден");
  };

  const handleSend = async (content: string, type: 'text' | 'image' = 'text') => {
    if (!content.trim() && type === 'text') return;
    if (!selectedUser || !user) return;

    await supabase.from('messages').insert([
      { text: type === 'text' ? content : null, image_url: type === 'image' ? content : null, type, from_id: user.id, to_id: selectedUser.id }
    ]);
    setMessage("");
    setShowAttachments(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    // Временно используем Blob для отображения, пока не настроен Storage
    const tempUrl = URL.createObjectURL(file);
    handleSend(tempUrl, 'image');
  };

  // --- ЭКРАНЫ АВТОРИЗАЦИИ ---
  if (!user) {
    return (
      <div className="h-[100dvh] bg-[#0e1621] flex items-center justify-center p-6 text-white">
        <form className="w-full max-w-sm space-y-4 bg-[#17212b] p-8 rounded-3xl shadow-2xl" onSubmit={handleAuth}>
          <div className="text-center mb-6">
             <div className="w-16 h-16 bg-blue-500 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20"><Send size={32} /></div>
             <h2 className="text-xl font-bold">Telegram Private</h2>
          </div>
          {isRegistering && (
            <input type="text" placeholder="Никнейм (мин. 3 символа)" required className="w-full bg-[#0e1621] border border-gray-800 p-3 rounded-xl outline-none focus:border-blue-500" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} />
          )}
          <input type="email" placeholder="Email" required className="w-full bg-[#0e1621] border border-gray-800 p-3 rounded-xl outline-none focus:border-blue-500" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Пароль" required className="w-full bg-[#0e1621] border border-gray-800 p-3 rounded-xl outline-none focus:border-blue-500" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 p-3 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-blue-500/20">{isRegistering ? 'Создать аккаунт' : 'Войти'}</button>
          <button type="button" onClick={() => setIsRegistering(!isRegistering)} className="w-full text-blue-400 text-sm">{isRegistering ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}</button>
        </form>
      </div>
    );
  }

  if (user && !myProfile) {
    return (
      <div className="h-[100dvh] bg-[#0e1621] flex items-center justify-center p-6 text-white">
        <div className="w-full max-w-sm space-y-4 bg-[#17212b] p-8 rounded-3xl text-center">
          <h2 className="text-xl font-bold">Ваш никнейм</h2>
          <p className="text-xs text-gray-400">Друзья смогут найти вас по этому имени</p>
          <input type="text" placeholder="Введите никнейм..." className="w-full bg-[#0e1621] border border-gray-800 p-3 rounded-xl outline-none focus:border-blue-500 text-center" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} />
          <button onClick={async () => {
             if (usernameInput.length < 3) return alert("Минимум 3 символа");
             const { error } = await supabase.from('profiles').insert([{ id: user.id, username: usernameInput }]);
             if (error) alert("Ник занят"); else fetchMyProfile(user.id);
          }} className="w-full bg-blue-500 p-3 rounded-xl font-bold">Сохранить</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-[#0e1621] text-white overflow-hidden font-sans select-none">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />

      {/* ZOOM IMAGE */}
      {fullScreenImage && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4" onClick={() => setFullScreenImage(null)}>
          <img src={fullScreenImage} className="max-w-full max-h-full object-contain animate-in zoom-in-95 duration-200" />
          <button className="absolute top-6 right-6 text-white bg-white/10 p-2 rounded-full"><X size={24}/></button>
        </div>
      )}

      {/* ЛЕВАЯ ПАНЕЛЬ */}
      <aside className={`${selectedUser ? 'hidden' : 'flex'} md:flex w-full md:w-[320px] lg:w-[380px] border-r border-gray-900 flex-col bg-[#17212b]`}>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-lg">Чаты</span>
            <button onClick={() => supabase.auth.signOut()} className="text-gray-500 hover:text-red-400 transition-colors"><LogOut size={20}/></button>
          </div>
          <div className="bg-[#0e1621] rounded-xl flex items-center px-3 py-2 border border-transparent focus-within:border-blue-500 transition-all">
            <Search size={18} className="text-gray-500" />
            <input 
              placeholder="Поиск по никнейму..." 
              className="bg-transparent border-none focus:ring-0 ml-2 w-full text-sm outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchUser()}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {recentChats.map((chat) => (
            <div 
              key={chat.id} 
              onClick={() => setSelectedUser(chat)}
              className={`flex items-center p-4 cursor-pointer transition-colors ${selectedUser?.id === chat.id ? 'bg-[#2b5278]' : 'hover:bg-[#202b36]'}`}
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 mr-3 flex items-center justify-center font-bold text-lg shadow-lg">
                {chat.username[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center"><span className="font-bold text-sm">@{chat.username}</span></div>
                <p className="text-xs text-blue-300 truncate opacity-70">Нажмите, чтобы открыть чат</p>
              </div>
            </div>
          ))}
          {recentChats.length === 0 && (
            <div className="p-10 text-center text-gray-500 text-sm italic">Используйте поиск выше, чтобы найти друга</div>
          )}
        </div>
        
        <div className="p-4 bg-[#0e1621]/50 border-t border-gray-900 text-center">
           <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Ваш профиль: @{myProfile?.username}</p>
        </div>
      </aside>

      {/* ОКНО ЧАТА */}
      <main className={`${!selectedUser ? 'hidden' : 'flex'} md:flex flex-1 flex-col relative bg-[#0e1621]`}>
        {selectedUser ? (
          <>
            <header className="h-16 px-4 bg-[#17212b]/95 backdrop-blur-md flex items-center justify-between border-b border-gray-900 z-20">
              <div className="flex items-center">
                <button onClick={() => setSelectedUser(null)} className="md:hidden mr-3 text-blue-400"><ChevronLeft size={28} /></button>
                <div className="w-10 h-10 bg-blue-500 rounded-full mr-3 flex items-center justify-center font-bold shadow-lg shadow-blue-500/10">
                  {selectedUser.username[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-sm">@{selectedUser.username}</div>
                  <div className="text-[10px] text-blue-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span> в сети
                  </div>
                </div>
              </div>
              <MoreVertical size={20} className="text-gray-400 cursor-pointer hover:text-white transition-colors" />
            </header>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-fixed opacity-95">
              {chatHistory.map((msg) => {
                const isMe = msg.from_id === user.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1`}>
                    <div 
                      onClick={() => msg.type === 'image' && setFullScreenImage(msg.image_url)}
                      className={`relative max-w-[80%] shadow-xl ${msg.type === 'image' ? 'p-1 rounded-xl' : 'px-3 py-2 rounded-2xl'} ${isMe ? 'bg-[#2b5278] rounded-tr-none' : 'bg-[#182533] rounded-tl-none'}`}
                    >
                      {msg.type === 'image' ? (
                        <img src={msg.image_url!} className="rounded-lg max-h-72 object-cover cursor-pointer hover:opacity-90 transition-opacity" />
                      ) : (
                        <p className="text-[15px] pr-8 break-words leading-relaxed">{msg.text}</p>
                      )}
                      <div className="absolute bottom-1 right-2 flex items-center gap-1 opacity-60">
                        <span className="text-[9px]">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        {isMe && <span className="text-[10px]">✓✓</span>}
                      </div>
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
              <form onSubmit={(e) => {e.preventDefault(); handleSend(message)}} className="max-w-5xl mx-auto flex items-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setShowAttachments(!showAttachments)} 
                  className={`p-2 transition-all ${showAttachments ? 'text-blue-400 rotate-45' : 'text-gray-500 hover:text-blue-400'}`}
                >
                  <Paperclip size={24} />
                </button>
                <div className="flex-1 bg-[#0e1621] rounded-2xl flex items-center px-4 min-h-[44px] border border-gray-800 focus-within:border-gray-700 transition-all">
                  <input 
                    value={message} 
                    onChange={(e) => setMessage(e.target.value)} 
                    placeholder="Сообщение" 
                    className="flex-1 bg-transparent border-none focus:ring-0 py-2 text-[16px] outline-none" 
                  />
                  <Smile size={22} className="text-gray-500 cursor-pointer hover:text-white transition-colors" />
                </div>
                <button 
                  type="submit" 
                  className="w-11 h-11 bg-blue-500 rounded-full flex items-center justify-center hover:bg-blue-600 active:scale-90 transition-all shadow-lg flex-shrink-0"
                >
                  {message.trim() ? <Send size={20} /> : <Mic size={22} />}
                </button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 italic">
             <div className="w-20 h-20 bg-gray-900 rounded-full flex items-center justify-center mb-4 opacity-20 text-4xl">💬</div>
             <p className="text-sm">Выберите чат или найдите друга</p>
          </div>
        )}
      </main>
    </div>
  );
}