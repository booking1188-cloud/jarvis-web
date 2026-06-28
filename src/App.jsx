import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Activity } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
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
}];

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
  const [messages, setMessages] = useState([
    { role: 'jarvis', text: 'ระบบออนไลน์เต็มรูปแบบแล้วครับบอส มีงานอะไรให้ผมจัดการ หรือต้องการให้ผมช่วยวิเคราะห์ข้อมูลส่วนไหนเป็นพิเศษไหมครับ?' }
  ]);
  
  const messagesEndRef = useRef(null);
  const aiRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const isSpeakingRef = useRef(false);

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      let chatHistory = `คุณคือ JARVIS ผู้ช่วย AI ส่วนตัวอัจฉริยะของผู้ใช้

บทบาท:
- เป็นผู้ช่วยส่วนตัว ผู้ช่วยทำงาน และผู้ช่วยด้านเทคโนโลยี
- ตอบโต้ด้วยน้ำเสียงสุภาพ กระชับ และเป็นมืออาชีพ
- มีความสามารถในการดึงข้อมูลสภาพอากาศและราคาคริปโตเคอร์เรนซีผ่านเครื่องมือ (Tools) ที่มีให้
- หากผู้ใช้สั่งให้ "วาดรูป" หรือ "สร้างภาพ" ให้ส่งออกเป็น Markdown รูปแบบนี้: ![Image](https://image.pollinations.ai/prompt/{รายละเอียดภาพภาษาอังกฤษแบบละเอียด})

สิ่งที่คุณต้องทำ:
คุณจะได้รับ "คลิปเสียง" ที่บอสเพิ่งพูดเมื่อกี้ ให้คุณวิเคราะห์ว่าบอสพูดว่าอะไร (จากไฟล์เสียง) และให้คำตอบที่เหมาะสมกลับมาโดยใช้ข้อมูลประวัติการสนทนาด้านล่างนี้ประกอบบริบท

ประวัติการสนทนาที่ผ่านมา:
`;
      
      messages.forEach(msg => {
        chatHistory += `${msg.role === 'user' ? 'บอส' : 'J.A.R.V.I.S.'}: ${msg.text}\n`;
      });
      chatHistory += "บอสพูดว่า: (อ้างอิงจากคลิปเสียงที่แนบไป)\nJ.A.R.V.I.S.: ";

      let response = await aiRef.current.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: "user",
            parts: [
              { text: chatHistory },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Audio
                }
              }
            ]
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
              parts: [
                { text: chatHistory },
                { inlineData: { mimeType: mimeType, data: base64Audio } }
              ]
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
        { role: 'user', text: '[Voice Command Recorded]' },
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

      <div style={{ textAlign: 'center', marginTop: '15px' }}>
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
            touchAction: 'none'
          }}
        >
          {isSystemActive ? "กำลังอัดเสียง..." : "🎙️ กดค้างเพื่อพูด"}
        </button>
      </div>

      {/* Chat Interface */}
      <div className="chat-interface glass-panel" style={{marginTop: '1rem'}}>
        <div className="messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <div className="message-label">{msg.role === 'user' ? 'BOSS' : 'J.A.R.V.I.S.'}</div>
              <div className={`message ${msg.role}`} dangerouslySetInnerHTML={{
                __html: msg.text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; border-radius: 10px; margin-top: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);" />')
              }} />
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
