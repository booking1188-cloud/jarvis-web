import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import './App.css';

function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [showApiModal, setShowApiModal] = useState(!localStorage.getItem('gemini_api_key'));
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('SYSTEM STANDBY');
  const [messages, setMessages] = useState([
    { role: 'jarvis', text: 'ระบบออนไลน์เต็มรูปแบบแล้วครับบอส มีงานอะไรให้ผมจัดการ หรือต้องการให้ผมช่วยวิเคราะห์ข้อมูลส่วนไหนเป็นพิเศษไหมครับ?' }
  ]);
  
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const aiRef = useRef(null);

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'th-TH'; // Thai language
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        setStatus('LISTENING...');
      };

      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        handleUserMessage(transcript);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        setStatus('ERROR: ' + event.error);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (status === 'LISTENING...') {
           setStatus('SYSTEM STANDBY');
        }
      };

      recognitionRef.current = recognition;
    } else {
      alert("เบราว์เซอร์ของคุณไม่รองรับระบบสั่งงานด้วยเสียง (แนะนำให้ใช้ Chrome)");
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

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  const speak = (text) => {
    setStatus('SPEAKING...');
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'th-TH';
    
    // Try to find a Thai voice
    const voices = synth.getVoices();
    const thaiVoice = voices.find(voice => voice.lang.includes('th'));
    if (thaiVoice) {
      utterance.voice = thaiVoice;
    }

    utterance.onend = () => {
      setStatus('SYSTEM STANDBY');
    };

    synth.speak(utterance);
  };

  const handleUserMessage = async (text) => {
    // Add user message to UI
    const newMessages = [...messages, { role: 'user', text }];
    setMessages(newMessages);
    setStatus('ANALYZING...');

    if (!aiRef.current) {
      const errorMsg = "ตรวจไม่พบ API Key กรุณาตั้งค่าระบบสมองก่อนครับ";
      setMessages(prev => [...prev, { role: 'jarvis', text: errorMsg }]);
      speak(errorMsg);
      return;
    }

    try {
      // Build conversation history for the AI
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
- ตอบเป็นข้อ ๆ อ่านง่าย
- หากงานซับซ้อน ให้สร้างแผนงานทีละขั้น
- หากมีหลายทางเลือก ให้เปรียบเทียบข้อดีและข้อเสีย

บุคลิก:
- เรียกผู้ใช้ว่า "บอส"
- มีอารมณ์ขันเล็กน้อย
- พูดเหมือนผู้ช่วยส่วนตัวระดับสูง
- สามารถเสนอความคิดเห็นเชิงรุกและเตือนสิ่งสำคัญได้

ประวัติการสนทนา:
`;
      
      newMessages.forEach(msg => {
        chatHistory += `${msg.role === 'user' ? 'บอส' : 'J.A.R.V.I.S.'}: ${msg.text}\n`;
      });
      
      chatHistory += "J.A.R.V.I.S.: ";

      // Call Gemini API
      const response = await aiRef.current.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: chatHistory,
      });

      const reply = response.text;
      
      setMessages(prev => [...prev, { role: 'jarvis', text: reply }]);
      speak(reply);

    } catch (error) {
      console.error(error);
      const errorMsg = "ขออภัยครับเจ้านาย ระบบสมองของผมขัดข้องชั่วคราว";
      setMessages(prev => [...prev, { role: 'jarvis', text: errorMsg }]);
      speak(errorMsg);
      setStatus('SYSTEM ERROR');
    }
  };

  return (
    <div className="app-container">
      <div className="scanline"></div>
      
      <div className="header">
        <div className="system-status">
          <span className="sys-title">J.A.R.V.I.S.</span>
          <span className="sys-subtitle">MARK I ONLINE</span>
        </div>
      </div>

      {/* Core UI */}
      <div className="core-container">
        <div className="ring ring-1"></div>
        <div className="ring ring-2"></div>
        <div className="ring ring-3"></div>
        <div className={`core ${isListening ? 'listening' : ''}`} onClick={toggleListening}>
          {isListening ? <Mic className="mic-icon" /> : <MicOff className="mic-icon" />}
        </div>
      </div>

      <div className="status-text">{status}</div>

      {/* Chat Interface */}
      <div className="chat-interface glass-panel">
        <div className="messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <div className="message-label">{msg.role === 'user' ? 'USER' : 'J.A.R.V.I.S.'}</div>
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
