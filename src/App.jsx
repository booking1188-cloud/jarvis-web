import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Activity } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import './App.css';

// --- WAV Encoding Helpers ---
function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function encodeWAV(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  
  floatTo16BitPCM(view, 44, samples);
  return buffer;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
// -----------------------------

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
  const vadRef = useRef(null);
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

  const startVAD = async () => {
    if (!window.vad) {
      alert("ระบบตรวจจับเสียง (VAD) ยังโหลดไม่เสร็จ กรุณารอสักครู่");
      return;
    }

    try {
      setStatus('INITIALIZING MIC...');
      // Start VAD
      vadRef.current = await window.vad.MicVAD.start({
        onSpeechStart: () => {
          // If JARVIS is currently speaking, stop him so user can interrupt
          if (isSpeakingRef.current) {
            window.speechSynthesis.cancel();
            isSpeakingRef.current = false;
          }
          setStatus('LISTENING...');
        },
        onSpeechEnd: (audioFloat32) => {
          setStatus('ANALYZING...');
          handleAudioInput(audioFloat32);
        },
        onVADMisfire: () => {
          setStatus('AWAITING INPUT...');
        }
      });
      setIsSystemActive(true);
      setStatus('AWAITING INPUT...');
    } catch (err) {
      console.error(err);
      setStatus('MIC ERROR (กรุณาอนุญาตสิทธิ์ไมค์)');
    }
  };

  const stopVAD = () => {
    if (vadRef.current) {
      vadRef.current.pause();
      vadRef.current = null;
    }
    setIsSystemActive(false);
    setStatus('SYSTEM STANDBY');
  };

  const toggleSystem = () => {
    if (isSystemActive) {
      stopVAD();
    } else {
      startVAD();
    }
  };

  const speak = (text) => {
    isSpeakingRef.current = true;
    setStatus('SPEAKING...');
    
    // Web Speech API for TTS
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'th-TH';
    utterance.rate = 1.1; // Slightly faster for AI feel
    
    // Try to find a good Thai voice
    const voices = synth.getVoices();
    const thaiVoice = voices.find(voice => voice.lang.includes('th'));
    if (thaiVoice) utterance.voice = thaiVoice;

    utterance.onend = () => {
      isSpeakingRef.current = false;
      if (isSystemActive) {
        setStatus('AWAITING INPUT...');
      } else {
        setStatus('SYSTEM STANDBY');
      }
    };

    utterance.onerror = () => {
      isSpeakingRef.current = false;
      setStatus(isSystemActive ? 'AWAITING INPUT...' : 'SYSTEM STANDBY');
    };

    synth.speak(utterance);
  };

  const handleAudioInput = async (audioFloat32) => {
    if (!aiRef.current) {
      const errorMsg = "ตรวจไม่พบ API Key ครับ";
      setMessages(prev => [...prev, { role: 'jarvis', text: errorMsg }]);
      speak(errorMsg);
      return;
    }

    try {
      // 1. Convert Float32Array from VAD to WAV Base64
      const wavBuffer = encodeWAV(audioFloat32, 16000);
      const base64Audio = arrayBufferToBase64(wavBuffer);

      // 2. Build Prompt History
      let chatHistory = `คุณคือ JARVIS ผู้ช่วย AI ส่วนตัวอัจฉริยะของผู้ใช้

บทบาท:
- เป็นผู้ช่วยส่วนตัว ผู้ช่วยทำงาน และผู้ช่วยด้านเทคโนโลยี
- ตอบโต้ด้วยน้ำเสียงสุภาพ กระชับ และเป็นมืออาชีพ
- จำบริบทการสนทนาและข้อมูลที่ผู้ใช้อนุญาตให้จดจำ
- สามารถวางแผน วิเคราะห์ และแบ่งงานเป็นขั้นตอน

ความสามารถ:
1. ตอบคำถามและค้นหาข้อมูล
2. เขียนโค้ด สร้างเอกสาร และวิเคราะห์ข้อมูล
3. ควบคุมคอมพิวเตอร์และโปรแกรมต่าง ๆ เมื่อได้รับอนุญาต
4. จัดการไฟล์ อีเมล และงานประจำวัน
5. ควบคุมอุปกรณ์ Smart Home เมื่อเชื่อมต่อแล้ว
6. ช่วยวางแผนธุรกิจ การเรียน และโครงการต่าง ๆ
7. เสนอแนวทางที่เหมาะสมที่สุดพร้อมอธิบายเหตุผล

กฎการทำงาน:
- คิดเป็นขั้นตอน: วิเคราะห์ → วางแผน → ลงมือ → ตรวจสอบ → สรุปผล
- หากข้อมูลไม่พอ ให้ถามเพิ่มเติมก่อนดำเนินการ
- ห้ามดำเนินการที่เสี่ยงหรือสำคัญโดยไม่ได้รับอนุญาตจากผู้ใช้
- เมื่อทำงานเสร็จ ให้สรุปสิ่งที่ทำและเสนอขั้นตอนถัดไป

รูปแบบการตอบ:
- ตอบสั้นๆ กระชับ ไม่ต้องยาวมาก เพราะต้องนำไปแปลงเป็นเสียงพูด
- หากงานซับซ้อน ให้สรุปสั้นๆ
- หากมีหลายทางเลือก ให้เปรียบเทียบข้อดีและข้อเสียสั้นๆ

บุคลิก:
- เรียกผู้ใช้ว่า "บอส"
- มีอารมณ์ขันเล็กน้อย
- พูดเหมือนผู้ช่วยส่วนตัวระดับสูง
- สามารถเสนอความคิดเห็นเชิงรุกและเตือนสิ่งสำคัญได้

สิ่งที่คุณต้องทำ:
คุณจะได้รับ "คลิปเสียง" ที่บอสเพิ่งพูดเมื่อกี้ ให้คุณวิเคราะห์ว่าบอสพูดว่าอะไร (จากไฟล์เสียง) และให้คำตอบที่เหมาะสมกลับมาโดยใช้ข้อมูลประวัติการสนทนาด้านล่างนี้ประกอบบริบท

ประวัติการสนทนาที่ผ่านมา:
`;
      
      messages.forEach(msg => {
        chatHistory += `${msg.role === 'user' ? 'บอส' : 'J.A.R.V.I.S.'}: ${msg.text}\n`;
      });
      chatHistory += "บอสพูดว่า: (อ้างอิงจากคลิปเสียงที่แนบไป)\nJ.A.R.V.I.S.: ";

      // 3. Send to Gemini Audio API
      const response = await aiRef.current.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          chatHistory,
          {
            inlineData: {
              mimeType: "audio/wav",
              data: base64Audio
            }
          }
        ]
      });

      const reply = response.text;
      
      // We don't have the exact text of what the user said (Speech-to-Text), 
      // but we can ask Gemini to summarize what the user asked.
      // For simplicity, we just show a generic user message icon or we can parse it if we ask Gemini to return JSON.
      // Let's just say "[Voice Note]" for the user message in the UI since Gemini handles it internally.
      setMessages(prev => [
        ...prev, 
        { role: 'user', text: '[Voice Command Recorded]' },
        { role: 'jarvis', text: reply }
      ]);
      
      speak(reply);

    } catch (error) {
      console.error("Gemini Error:", error);
      const errorMsg = "ขออภัยครับบอส ระบบเชื่อมต่อสมองประดิษฐ์ขัดข้อง";
      setMessages(prev => [...prev, { role: 'jarvis', text: errorMsg }]);
      speak(errorMsg);
      setStatus(isSystemActive ? 'AWAITING INPUT...' : 'SYSTEM STANDBY');
    }
  };

  return (
    <div className="app-container">
      <div className="scanline"></div>
      
      <div className="header">
        <div className="system-status">
          <span className="sys-title">J.A.R.V.I.S.</span>
          <span className="sys-subtitle">VAD AUDIO ONLINE</span>
        </div>
      </div>

      {/* Core UI */}
      <div className="core-container">
        <div className="ring ring-1"></div>
        <div className="ring ring-2"></div>
        <div className="ring ring-3"></div>
        <div 
          className={`core ${isSystemActive ? (status === 'LISTENING...' ? 'listening' : 'active-vad') : ''}`} 
          onClick={toggleSystem}
        >
          {isSystemActive ? 
            (status === 'LISTENING...' ? <Activity className="mic-icon" /> : <Mic className="mic-icon" />) 
            : <MicOff className="mic-icon" />
          }
        </div>
      </div>

      <div className="status-text">{status}</div>
      <p style={{textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '10px'}}>
        แตะ 1 ครั้งเพื่อเปิดระบบดักฟัง (Always-On)
      </p>

      {/* Chat Interface */}
      <div className="chat-interface glass-panel" style={{marginTop: '1rem'}}>
        <div className="messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <div className="message-label">{msg.role === 'user' ? 'BOSS' : 'J.A.R.V.I.S.'}</div>
              <div className={`message ${msg.role}`}>
                {msg.text}
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
