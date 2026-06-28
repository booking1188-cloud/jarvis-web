# JARVIS Web 🤖

JARVIS Web คือผู้ช่วย AI ส่วนตัวที่ถูกพัฒนาขึ้นเพื่อทำงานบนเบราว์เซอร์ โดยผสานพลังของ Gemini AI 2.5 Flash พร้อมกับฟีเจอร์การทำงานขั้นสูง

## ✨ ฟีเจอร์ล่าสุด (Milestone 1)

- **Gemini 2.5 Flash Integration**: ระบบประมวลผลภาษาและวิเคราะห์ข้อมูลที่รวดเร็ว
- **Multimodal Input**: รองรับการพิมพ์ข้อความ, การสั่งงานด้วยเสียง (Push-to-Talk) และการส่งรูปภาพ/ถ่ายรูปจากกล้อง
- **Function Calling**: ระบบใช้เครื่องมืออัตโนมัติ (เช่น ดูสภาพอากาศ, เช็คราคาเหรียญ Crypto, สร้างรูปภาพด้วย AI)
- **Cloud Memory & Authentication (Firebase)**: 
  - ล็อกอินด้วยบัญชี Google
  - บันทึกประวัติการสนทนาข้ามอุปกรณ์ผ่านระบบ Cloud Firestore แบบ Real-time
- **Offline Support (PWA)**: ติดตั้งแอปบนมือถือหรือคอมพิวเตอร์เพื่อใช้งานแบบ Full-screen ได้

## 🚀 วิธีการติดตั้งและใช้งานสำหรับนักพัฒนา

1. Clone โปรเจกต์นี้
2. ติดตั้ง Dependencies: `npm install`
3. ตั้งค่า Firebase:
   - คัดลอก `firebaseConfig` ของคุณใส่ในไฟล์ `src/firebase.js`
4. รันระบบ: `npm run dev`

## ⚙️ โครงสร้างการทำงาน

- `src/App.jsx`: ศูนย์กลางการจัดการ UI, State, และการเรียกใช้งาน Gemini API
- `src/firebase.js`: ระบบเชื่อมต่อฐานข้อมูล Firestore และระบบยืนยันตัวตน

---
*Developed for Book (Vijittamma) - J.A.R.V.I.S Master Plan*
