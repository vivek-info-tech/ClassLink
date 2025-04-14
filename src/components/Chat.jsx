import { useState, useEffect, useRef } from "react";
import "./Chat.css";
import useToast from "../hooks/useToast";
import { onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import useAuth from "../hooks/useAuth";
import { messagesRef } from "../utils/firebaseConfig";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

export default function Chat({ chatId }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    const icons = {
      pdf: '📄',
      doc: '📝', docx: '📝',
      xls: '📊', xlsx: '📊',
      ppt: '📑', pptx: '📑',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️',
      zip: '🗜️', rar: '🗜️',
      mp3: '🎵', wav: '🎵',
      mp4: '🎬', mov: '🎬', avi: '🎬'
    };
    return icons[extension] || '📁';
  };
  const user = useAuth(); // Changed destructuring to direct assignment
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(messagesRef(chatId), (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(msgs);
      scrollToBottom();
    });

    return () => unsubscribe();
  }, [chatId]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !file) return;

    const messageData = {
      senderId: user.uid,
      senderName: user.displayName || "Anonymous",
      timestamp: serverTimestamp()
    };

    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        createToast({
          title: 'File too large',
          message: `File exceeds ${formatFileSize(MAX_FILE_SIZE)} limit`,
          type: 'danger',
          duration: 5000
        });
        console.warn('File size limit exceeded:', {
          fileSize: file.size,
          maxSize: MAX_FILE_SIZE
        });
        return;
      }
      
      // Upload file to Firebase Storage with progress tracking
      const storageRef = ref(storage, `chat-files/${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error('File upload failed:', {
            error: error.toString(),
            name: error.name,
            message: error.message,
            file: file.name
          });
          createToast({
            title: 'Upload failed',
            message: `Could not upload ${file.name}`,
            type: 'danger',
            duration: 5000
          });
          setUploadProgress(0);
        },
        async () => {
          const fileURL = await getDownloadURL(uploadTask.snapshot.ref);
          messageData.fileURL = fileURL;
          messageData.fileName = file.name;
          messageData.fileSize = file.size;
          messageData.text = newMessage;
          await addDoc(messagesRef(chatId), messageData);
          setNewMessage("");
          setFile(null);
          setUploadProgress(0);
        }
      );
      return;
    } else {
      messageData.text = newMessage;
    }

    await addDoc(messagesRef(chatId), messageData);
    setNewMessage("");
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg) => (
          <div 
            key={msg.id}
            className={`message ${msg.senderId === user.uid ? 'sent' : 'received'}`}
          >
            <span className="sender">{msg.senderName}</span>
            {msg.text && <p>{msg.text}</p>}
            {msg.fileURL && (
              <div className="file-message">
                {['.jpg','.jpeg','.png','.gif'].some(ext => msg.fileName.toLowerCase().endsWith(ext)) ? (
                  <div className="image-preview">
                    <img src={msg.fileURL} alt={msg.fileName} />
                    <a href={msg.fileURL} target="_blank" rel="noopener noreferrer">
                      {getFileIcon(msg.fileName)} {msg.fileName} 
                      {msg.fileSize && <span className="file-size">({formatFileSize(msg.fileSize)})</span>}
                    </a>
                  </div>
                ) : (
                  <a href={msg.fileURL} target="_blank" rel="noopener noreferrer">
                    {getFileIcon(msg.fileName)} {msg.fileName}
                  </a>
                )}
              </div>
            )}
            <span className="time">
              {msg.timestamp?.toDate().toLocaleTimeString()}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendMessage} className="message-form">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
        />
        <input
          type="file"
          id="file-upload"
          onChange={(e) => setFile(e.target.files[0])}
          style={{display: 'none'}}
        />
        <label htmlFor="file-upload" className="file-upload-button">
          📎
        </label>
        <button type="submit">Send</button>
        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className="upload-progress">
            <div 
              className="progress-bar" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        )}
      </form>
    </div>
  );
}
