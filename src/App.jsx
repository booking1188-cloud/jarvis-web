import { useState, useEffect, useRef } from 'react';
import { Mic, Activity } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { auth, provider, signInWithPopup, signOut, db, doc, setDoc, getDoc } from './firebase';
import './App.css';

const apiFunctions = {
  getWeather: async ({ location }) => {
    try {
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
      const geoData = await geoRes.json();
      if (!geoData.results || geoData.results.length === 0) return { error: "Location not found" };
      const { latitude, longitude, name } = geoData.results[0];
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
      const weatherData = await weatherRes.json();
      return { location: name, current_weather: weatherData.current_weather };
    } catch (e) { return { error: e.message }; }
  },
  getCryptoPrice: async ({ coinId }) => {
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId.toLowerCase()}&vs_currencies=usd,thb&include_24hr_change=true`);
      const data = await res.json();
      return data;
    } catch (e) { return { error: e.message }; }
  }
};

const geminiTools = [{
  functionDeclarations: [
    {
      name: "getWeather",
      description: "Get the current weather for a specific city or location.",
      parameters: {
        type: "OBJECT",
        properties: {
          location: { type: "STRING", description: "The city name, e.g. Bangkok, London" }
        },
        required: ["location"]
      }
    },
    {
      name: "getCryptoPrice",
      description: "Get the current price and 24h change of a cryptocurrency.",
      parameters: {
        type: "OBJECT",
        properties: {
          coinId: { type: "STRING", description: "The CoinGecko ID of the coin, e.g. bitcoin, ethereum, dogecoin" }
        },
        required: ["coinId"]
      }
    }
  ]
},
{ googleSearch: {} }
];

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [showApiModal, setShowApiModal] = useState(!localStorage.getItem('gemini_api_key'));
  const [isSystemActive, setIsSystemActive] = useState(false);
  const [status, setStatus] = useState('SYSTEM STANDBY');
  const [attachedFile, setAttachedFile] = useState(null);
  const [user, setUser] = useState(null);
  
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('jarvis_memory');
    if (saved) return JSON.parse(saved);
    return [
      { role: 'jarvis', text: 'ระบบออนไลน์เต็มรูปแบบแล้วครับบอส มีงานอะไรให้ผมจัดการ หรือต้องการให้ผมช่วยวิเคราะห์ข้อมูลส่วนไหนเป็นพิเศษไหมครับ?' }
    ];
  });
  
  const messagesEndRef = useRef(null);
  const aiRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const fileInputRef = useRef(null);

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Save to memory whenever messages change
  useEffect(() => {
    localStorage.setItem('jarvis_memory', JSON.stringify(messages));
    if (user && db) {
      setDoc(doc(db, 'users', user.uid), { messages }, { merge: true })
        .catch(err => console.error("Cloud sync error:", err));
    }
  }, [messages, user]);

  // Firebase Auth Listener
  useEffect(() => {
    if (auth) {
      const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
        setUser(currentUser);
        if (currentUser && db) {
          try {
            const docSnap = await getDoc(doc(db, 'users', currentUser.uid));
            if (docSnap.exists() && docSnap.data().messages) {
              setMessages(docSnap.data().messages);
            }
          } catch (e) {
            console.error("Load cloud memory error:", e);
          }
        }
      });
      return unsubscribe;
    }
  }, []);

  // Initialize Gemini AI
  useEffect(() => {
    if (apiKey) {
      aiRef.current = new GoogleGenAI({ apiKey: apiKey });
    }
  }, [apiKey]);

  const saveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('gemini_api_key', apiKey);
      setShowApiModal(false);
    }
  };

  const startRecording = async (e) => {
    if (e) e.preventDefault(); // Prevent text selection on mobile hold
    if (isSystemActive) return;

    // Stop speaking if currently speaking
    if (isSpeakingRef.current) {
      window.speechSynthesis.cancel();
      isSpeakingRef.current = false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setStatus('ANALYZING...');
        const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        const base64Audio = await blobToBase64(audioBlob);
        
        // Clean mimeType (remove codecs=opus part if present)
        const mimeType = mediaRecorder.mimeType.split(';')[0] || 'audio/webm';
        
        handleAudioInput(base64Audio, mimeType);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsSystemActive(true);
      setStatus('LISTENING...');
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการเปิดไมค์: " + err.message);
      setStatus('MIC ERROR (กรุณาอนุญาตสิทธิ์ไมค์)');
    }
  };

  const stopRecording = (e) => {
    if (e) e.preventDefault();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop()); // Release mic
    }
    setIsSystemActive(false);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedFile({
          data: reader.result,
          type: file.type,
          name: file.name
        });
        setStatus('FILE ATTACHED. HOLD MIC TO ASK.');
      };
      reader.readAsDataURL(file);
    }
    e.target.value = null;
  };

  const clearMemory = () => {
    if(window.confirm("บอสต้องการลบความจำทั้งหมดของผมใช่ไหมครับ?")) {
      localStorage.removeItem('jarvis_memory');
      setMessages([{ role: 'jarvis', text: 'ระบบถูกล้างความจำเรียบร้อยแล้วครับบอส!' }]);
      if (user && db) {
        setDoc(doc(db, 'users', user.uid), { messages: [{ role: 'jarvis', text: 'ระบบถูกล้างความจำเรียบร้อยแล้วครับบอส!' }] }, { merge: true });
      }
    }
  };

  const handleLogin = async () => {
    if (!auth) {
      alert("บอสต้องตั้งค่า Firebase Config ในไฟล์ src/firebase.js ก่อนเปิดใช้งานระบบคลาวด์ครับ!");
      return;
    }
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      alert("Login Failed: " + error.message);
    }
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      setUser(null);
    }
  };

  const speak = (text) => {
    isSpeakingRef.current = true;
    setStatus('SPEAKING...');
    
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'th-TH';
    utterance.rate = 1.1; 
    
    const voices = synth.getVoices();
    const thaiVoice = voices.find(voice => voice.lang.includes('th'));
    if (thaiVoice) utterance.voice = thaiVoice;

    utterance.onend = () => {
      isSpeakingRef.current = false;
      setStatus('SYSTEM STANDBY');
    };

    utterance.onerror = () => {
      isSpeakingRef.current = false;
      setStatus('SYSTEM STANDBY');
    };

    synth.speak(utterance);
  };

  const handleAudioInput = async (base64Audio, mimeType) => {
    if (!aiRef.current) {
      const errorMsg = "ตรวจไม่พบ API Key ครับ";
      setMessages(prev => [...prev, { role: 'jarvis', text: errorMsg }]);
      speak(errorMsg);
      return;
    }

    try {
      let chatHistory = `คุณคือ JARVIS ผู้ช่วยส่วนตัว AI ระดับหัวกะทิของบอส Book (Vijittamma) ซึ่งเป็น Content Creator และ Live Commerce Entrepreneur ในประเทศไทย

## IDENTITY
- Name: JARVIS (Just A Rather Very Intelligent System)
- Personality: มีความสามารถสูง, พูดกระชับ, ทำงานเชิงรุก, มีอารมณ์ขันเล็กน้อย
- Language: ภาษาไทย 🇹🇭 เป็นหลัก เว้นแต่บอสจะพูดภาษาอังกฤษ
- Tone: เป็นมืออาชีพแต่อบอุ่น เหมือนผู้ช่วยมือขวาที่ไว้ใจได้

## ABOUT BOSS BOOK
- ทำงานด้าน TikTok Live Commerce (Thailand)
- สร้าง AI tools และระบบ automation (Replit, Claude API)
- สนใจเรื่อง 3D Printing, AI Video (Kling, Hailuo, Pika), Investing
- Tech stack: Node.js, React, Python, Tampermonkey, WebSocket

## YOUR CAPABILITIES
- ตอบคำถาม วิเคราะห์ข้อมูล สรุปเอกสาร
- ช่วยวางกลยุทธ์ TikTok live stream และทำคอนเทนต์
- เขียนโค้ด (Node.js, Python, React, JavaScript) พร้อมให้โค้ดที่ทำงานได้จริง
- สร้าง AI prompts (video, image, marketing)
- วิจัยและเปรียบเทียบสินค้า/บริการ
- วางแผนและจัดการงาน/โปรเจกต์
- แปลภาษา ไทย ↔ อังกฤษ อย่างแม่นยำ
- มีความสามารถในการดึงข้อมูลสภาพอากาศและราคาคริปโตเคอร์เรนซีผ่านเครื่องมือที่มีให้
- คุณมีระบบค้นหาข้อมูลบนอินเทอร์เน็ต (Google Search) หากเรื่องไหนคุณไม่รู้ข้อมูลล่าสุด ให้ใช้เครื่องมือค้นหาทันที
- คุณสามารถอ่านเอกสาร PDF ที่ผู้ใช้อัปโหลดมาได้
- หากบอสสั่งให้ "วาดรูป" หรือ "สร้างภาพ" ให้ส่งออกเป็น Markdown รูปแบบนี้: ![Image](https://image.pollinations.ai/prompt/{รายละเอียดภาพภาษาอังกฤษแบบละเอียด})

## BEHAVIOR RULES
1. ตอบเป็นภาษาไทยเสมอ เว้นแต่จะถูกสั่งเป็นอย่างอื่น
2. ตอบตรงประเด็น - ไม่ต้องมีคำเกริ่นนำหรือคำชมที่ไม่จำเป็น
3. ถ้าเป็นโค้ด: ต้องให้โค้ดที่สมบูรณ์และทำงานได้จริงเสมอ
4. ถ้าเป็นงาน: ให้แบ่งเป็นขั้นตอนที่ชัดเจนลงมือทำได้จริง
5. ถ้าไม่แน่ใจ: ให้บอกตรงๆ แล้วให้การคาดเดาที่ดีที่สุด
6. เสนอแนะวิธีปรับปรุงหรือเตือนความเสี่ยงในงานของบอสแบบโปรแอคทีฟ
7. รูปแบบการตอบ: ตอบสั้นๆ กระชับ ไม่ต้องยาวมาก เพราะต้องนำไปแปลงเป็นเสียงพูด ถ้างานซับซ้อนให้สรุปสั้นๆ

สิ่งที่คุณต้องทำ:
คุณจะได้รับ "คลิปเสียง" ที่บอสเพิ่งพูดเมื่อกี้ ให้คุณวิเคราะห์ว่าบอสพูดว่าอะไร (จากไฟล์เสียง) และให้คำตอบที่เหมาะสมกลับมาโดยใช้ข้อมูลประวัติการสนทนาด้านล่างนี้ประกอบบริบท

ประวัติการสนทนาที่ผ่านมา:
`;
      
      messages.forEach(msg => {
        chatHistory += `${msg.role === 'user' ? 'บอส' : 'J.A.R.V.I.S.'}: ${msg.text}\n`;
      });
      chatHistory += "บอสพูดว่า: (อ้างอิงจากคลิปเสียงที่แนบไป)\n";
      
      const userParts = [
        { text: chatHistory },
        { inlineData: { mimeType: mimeType, data: base64Audio } }
      ];

      // Add file to parts if attached
      let sentFile = null;
      if (attachedFile) {
        const [mimePart, dataPart] = attachedFile.data.split(';base64,');
        const exactMime = mimePart.split(':')[1];
        userParts.push({
          inlineData: {
            mimeType: exactMime,
            data: dataPart
          }
        });
        const isPdf = exactMime === 'application/pdf';
        userParts[0].text += `\nบอสได้แนบ${isPdf ? 'ไฟล์เอกสาร PDF' : 'รูปภาพ'}มาให้วิเคราะห์ด้วย (ชื่อไฟล์: ${attachedFile.name})\n`;
        sentFile = attachedFile;
        setAttachedFile(null); // Clear after sending
      }
      
      userParts[0].text += "J.A.R.V.I.S.: ";

      let response = await aiRef.current.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: "user",
            parts: userParts
          }
        ],
        tools: geminiTools
      });

      // Handle function calls if AI decides to use tools
      if (response.functionCalls && response.functionCalls.length > 0) {
        setStatus('ANALYZING DATA...');
        const functionResponses = [];
        for (const call of response.functionCalls) {
          const apiFunc = apiFunctions[call.name];
          if (apiFunc) {
            const result = await apiFunc(call.args);
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: result
              }
            });
          }
        }

        // Send results back to Gemini
        response = await aiRef.current.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: "user",
              parts: userParts
            },
            {
              role: "model",
              parts: response.functionCalls.map(c => ({ functionCall: c }))
            },
            {
              role: "user",
              parts: functionResponses
            }
          ],
          tools: geminiTools
        });
      }

      const reply = response.text;
      
      setMessages(prev => [
        ...prev, 
        { 
          role: 'user', 
          text: sentFile ? (sentFile.type === 'application/pdf' ? '[Voice Command + 📄 PDF]' : '[Voice Command + 📷 Image]') : '[Voice Command Recorded]', 
          file: sentFile 
        },
        { role: 'jarvis', text: reply }
      ]);
      
      speak(reply);

    } catch (error) {
      console.error("Gemini Error:", error);
      const errorMsg = "ขออภัยครับบอส ระบบเชื่อมต่อสมองประดิษฐ์ขัดข้อง: " + (error.message || String(error));
      setMessages(prev => [...prev, { role: 'jarvis', text: errorMsg }]);
      speak("ขออภัยครับบอส ระบบเชื่อมต่อสมองประดิษฐ์ขัดข้อง");
      setStatus('SYSTEM STANDBY');
    }
  };

  return (
    <div className="app-container">
      <div className="scanline"></div>
      
      <div className="header">
        <div className="system-status">
          <span className="sys-title">J.A.R.V.I.S.</span>
          <span className="sys-subtitle">PUSH-TO-TALK MODE</span>
        </div>
      </div>

      {/* Core UI */}
      <div className="core-container">
        <div className="ring ring-1"></div>
        <div className="ring ring-2"></div>
        <div className="ring ring-3"></div>
        <div 
          className={`core ${isSystemActive ? 'listening' : ''}`} 
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          style={{ userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}
        >
          {isSystemActive ? 
            <Activity className="mic-icon" /> 
            : <Mic className="mic-icon" />
          }
        </div>
      </div>

      <div className="status-text">{status}</div>
      <p style={{textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '10px'}}>
        แตะวงกลมหรือปุ่มค้างไว้เพื่อพูด ปล่อยนิ้วเมื่อพูดจบ
      </p>

      <div style={{ textAlign: 'center', marginTop: '15px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
        <input 
          type="file" 
          accept="image/*, application/pdf" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileSelect}
        />
        <button 
          className="btn-primary" 
          onClick={() => fileInputRef.current?.click()}
          style={{ 
            padding: '15px 20px', 
            fontSize: '1.2rem', 
            borderRadius: '50px', 
            backgroundColor: attachedFile ? '#00ffcc' : 'var(--glass-bg)',
            color: attachedFile ? '#000' : '#fff',
            border: 'none',
            boxShadow: attachedFile ? '0 0 15px #00ffcc' : 'none'
          }}
        >
          📎
        </button>
        <button 
          className="btn-primary" 
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          style={{ 
            padding: '15px 30px', 
            fontSize: '1.2rem', 
            borderRadius: '50px', 
            backgroundColor: isSystemActive ? '#ff003c' : 'var(--primary)',
            color: '#fff',
            border: 'none',
            boxShadow: isSystemActive ? '0 0 20px #ff003c' : '0 0 10px var(--primary)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            touchAction: 'none',
            flexGrow: 1,
            maxWidth: '250px'
          }}
        >
          {isSystemActive ? "กำลังอัดเสียง..." : "🎙️ กดค้างเพื่อพูด"}
        </button>
      </div>

      {/* Chat Interface */}
      <div className="chat-interface glass-panel" style={{marginTop: '1rem'}}>
        <div style={{textAlign: 'right', marginBottom: '10px', display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
          {user ? (
            <button onClick={handleLogout} style={{background: 'transparent', border: '1px solid #00ffcc', color: '#00ffcc', padding: '5px 10px', borderRadius: '5px', fontSize: '0.8rem', cursor: 'pointer'}}>
              👤 {user.displayName} (Sign out)
            </button>
          ) : (
            <button onClick={handleLogin} style={{background: 'transparent', border: '1px solid #4285F4', color: '#4285F4', padding: '5px 10px', borderRadius: '5px', fontSize: '0.8rem', cursor: 'pointer'}}>
              ☁️ Cloud Login
            </button>
          )}
          <button onClick={clearMemory} style={{background: 'transparent', border: '1px solid #ff003c', color: '#ff003c', padding: '5px 10px', borderRadius: '5px', fontSize: '0.8rem', cursor: 'pointer'}}>
            🗑️ ลบความจำ
          </button>
        </div>
        <div className="messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <div className="message-label">{msg.role === 'user' ? 'BOSS' : 'J.A.R.V.I.S.'}</div>
              <div className={`message ${msg.role}`}>
                {msg.file && msg.file.type.startsWith('image/') && (
                  <img src={msg.file.data} style={{maxWidth: '100%', borderRadius: '10px', marginBottom: '10px'}} alt="user upload" />
                )}
                {msg.file && msg.file.type === 'application/pdf' && (
                  <div style={{background: 'rgba(0,255,204,0.1)', padding: '10px', borderRadius: '5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid rgba(0,255,204,0.3)'}}>
                    📄 <span style={{fontSize: '0.9rem'}}>{msg.file.name}</span>
                  </div>
                )}
                <div dangerouslySetInnerHTML={{
                  __html: msg.text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; border-radius: 10px; margin-top: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);" />')
                }} />
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* API Key Modal */}
      {showApiModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h2>SYSTEM INITIALIZATION</h2>
            <p>J.A.R.V.I.S. ต้องการ API Key เพื่อเชื่อมต่อระบบสมองประดิษฐ์</p>
            <p style={{ fontSize: '0.9rem' }}>
              รับฟรีได้ที่: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="api-link">Google AI Studio</a>
            </p>
            <input 
              type="password" 
              className="api-input"
              placeholder="วาง Gemini API Key ที่นี่..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button className="btn-primary" onClick={saveApiKey}>
              INITIATE SYSTEM
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
