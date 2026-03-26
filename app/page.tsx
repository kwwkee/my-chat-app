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
  const [usernameInput, setUsernameInput] = useState(""); // Для регистрации никнейма
  const [isRegistering, setIsRegistering] = useState(false);

  // Состояния чата
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. ПРОВЕРКА СЕССИИ И ПРОФИЛЯ
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchMyProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchMyProfile(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchMyProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setMyProfile(data);
  };

  // 2. ЗАГРУЗКА ЛИЧНЫХ СООБЩЕНИЙ
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
        // Показываем только если сообщение относится к текущему чату
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

  // 3. ФУНКЦИИ АВТОРИЗАЦИИ И ПОИСКА
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return alert(error.message);
      // После регистрации создаем профиль
      if (data.user) {
        await supabase.from('profiles').insert([{ id: data.user.id, username: usernameInput }]);
      }
      alert("Аккаунт создан!");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }
  };

  const handleSearchUser = async () => {
    if (!searchQuery) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', searchQuery.trim())
      .single();
    
    if (data) {
      setSelectedUser(data);
      setSearchQuery("");
    } else {
      alert("Пользователь не найден");
    }
  };

  const handleSend = async (content: string, type: 'text' | 'image' = 'text') => {
    if (!content.trim() && type === 'text') return;
    if (!selectedUser || !user) return;

    await supabase.from('messages').insert([
      { text: type === 'text' ? content : null, image_url: type === 'image' ? content : null, type, from_id: user.id, to_id: selectedUser.id }
    ]);
    setMessage("");
  };

  // --- ЭКРАН ВХОДА ---
 if (!user) {
    return (
      <div className="h-[100dvh] bg-[#0e1621] flex items-center justify-center p-6 text-white text-center">
        <form className="w-full max-w-sm space-y-4" onSubmit={handleAuth}>
          <div className="w-20 h-20 bg-blue-500 rounded-3xl mx-auto flex items-center justify-center mb-4"><Send size={40} /></div>
          <h2 className="text-2xl font-bold italic">Telegram Private</h2>
          {isRegistering && (
            <input type="text" placeholder="Придумайте никнейм" required className="w-full bg-[#17212b] border border-gray-800 p-3 rounded-xl outline-none focus:border-blue-500" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} />
          )}
          <input type="email" placeholder="Email" required className="w-full bg-[#17212b] border border-gray-800 p-3 rounded-xl outline-none focus:border-blue-500" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Пароль" required className="w-full bg-[#17212b] border border-gray-800 p-3 rounded-xl outline-none focus:border-blue-500" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="w-full bg-blue-500 p-3 rounded-xl font-bold">{isRegistering ? 'Создать аккаунт' : 'Войти'}</button>
          <button type="button" onClick={() => setIsRegistering(!isRegistering)} className="w-full text-blue-400 text-sm">{isRegistering ? 'Уже есть аккаунт?' : 'Создать аккаунт'}</button>
        </form>
      </div>
    );
  }

  // НОВОЕ: Если юзер вошел, но профиля с ником нет (для старых аккаунтов)
  if (user && !myProfile) {
    return (
      <div className="h-[100dvh] bg-[#0e1621] flex items-center justify-center p-6 text-white text-center">
        <div className="w-full max-w-sm space-y-4">
          <h2 className="text-xl font-bold">Завершите регистрацию</h2>
          <p className="text-sm text-gray-400">Пожалуйста, придумайте никнейм, чтобы другие могли вас найти.</p>
          <input 
            type="text" placeholder="Ваш никнейм" 
            className="w-full bg-[#17212b] border border-gray-800 p-3 rounded-xl outline-none focus:border-blue-500" 
            value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} 
          />
          <button 
            onClick={async () => {
               if (usernameInput.length < 3) return alert("Минимум 3 символа");
               const { error } = await supabase.from('profiles').insert([{ id: user.id, username: usernameInput }]);
               if (error) alert("Ник уже занят или ошибка: " + error.message);
               else fetchMyProfile(user.id);
            }}
            className="w-full bg-blue-500 p-3 rounded-xl font-bold"
          >
            Сохранить никнейм
          </button>
        </div>
      </div>
    );
  }

  // --- ОСНОВНОЙ ЧАТ ---
  return (
    <div className="flex h-[100dvh] bg-[#0e1621] text-white overflow-hidden">
      {fullScreenImage && (
        <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center" onClick={() => setFullScreenImage(null)}>
          <img src={fullScreenImage} className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {/* ЛЕВАЯ ПАНЕЛЬ С ПОИСКОМ */}
      <aside className={`${selectedUser ? 'hidden' : 'flex'} md:flex w-full md:w-[350px] border-r border-gray-900 flex-col bg-[#17212b]`}>
        <div className="p-4 flex items-center gap-2">
          <div className="flex-1 bg-[#0e1621] rounded-full flex items-center px-3 py-1.5">
            <Search size={16} className="text-gray-500" />
            <input 
              placeholder="Поиск по никнейму..." 
              className="bg-transparent border-none focus:ring-0 ml-2 w-full text-sm outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearchUser()}
            />
          </div>
          <button onClick={handleSearchUser} className="text-blue-400"><UserPlus size={24} /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {selectedUser && (
            <div className="bg-[#2b5278] p-4 flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-400 rounded-full flex items-center justify-center font-bold">{selectedUser.username[0].toUpperCase()}</div>
              <div><div className="font-bold">{selectedUser.username}</div><div className="text-xs text-blue-200">Переписка начата</div></div>
            </div>
          )}
          <div className="p-4 text-center text-xs text-gray-500 italic mt-10">
            {myProfile ? `Ваш ник: @${myProfile.username}` : "Загрузка профиля..."}
          </div>
          <button onClick={() => supabase.auth.signOut()} className="m-4 text-red-400 flex items-center gap-2 text-sm italic opacity-50"><LogOut size={16}/> Выйти</button>
        </div>
      </aside>

      {/* ОКНО ЧАТА */}
      <main className={`${!selectedUser ? 'hidden' : 'flex'} md:flex flex-1 flex-col relative`}>
        {selectedUser ? (
          <>
            <header className="h-14 px-4 bg-[#17212b] flex items-center gap-3 border-b border-gray-900">
              <button onClick={() => setSelectedUser(null)} className="md:hidden text-blue-400"><ChevronLeft size={28} /></button>
              <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center font-bold text-xs">{selectedUser.username[0].toUpperCase()}</div>
              <div className="font-bold">{selectedUser.username}</div>
            </header>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-fixed opacity-95">
              {chatHistory.map((msg) => (
                <div key={msg.id} className={`flex ${msg.from_id === user.id ? 'justify-end' : 'justify-start'}`}>
                  <div 
                    onClick={() => msg.type === 'image' && setFullScreenImage(msg.image_url)}
                    className={`relative max-w-[80%] p-2 rounded-2xl ${msg.from_id === user.id ? 'bg-[#2b5278] rounded-tr-none' : 'bg-[#182533] rounded-tl-none'}`}
                  >
                    {msg.type === 'image' ? (
                      <img src={msg.image_url!} className="rounded-lg max-h-60 object-cover cursor-pointer" />
                    ) : (
                      <p className="text-sm pr-10">{msg.text}</p>
                    )}
                    <span className="text-[9px] text-gray-400 absolute bottom-1 right-2">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <footer className="p-3 bg-[#17212b]">
              <form onSubmit={(e) => {e.preventDefault(); handleSend(message)}} className="flex items-center gap-2">
                <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Написать..." className="flex-1 bg-[#0e1621] p-3 rounded-2xl outline-none" />
                <button type="submit" className="bg-blue-500 w-11 h-11 rounded-full flex items-center justify-center"><Send size={20}/></button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 italic">Напишите никнейм друга в поиске слева</div>
        )}
      </main>
    </div>
  );
}