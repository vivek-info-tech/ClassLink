import { useRef, useEffect, useState } from "react";
import Chat from "../components/Chat";
import Peer from "simple-peer";
import { onAuthStateChanged } from "firebase/auth";
import { getDocs, query, where, doc, collection, onSnapshot, addDoc } from "firebase/firestore";
import moment from "moment";
import { useNavigate, useParams } from "react-router-dom";
import useToast from "../hooks/useToast";
import { firebaseAuth, meetingsRef } from "../utils/firebaseConfig";
import { generateMeetingID } from "../utils/generateMeetingId";

export default function JoinMeeting() {
  const params = useParams();
  const navigate = useNavigate();
  const [createToast] = useToast();
  const [isAllowed, setIsAllowed] = useState(false);
  const [user, setUser] = useState(undefined);
  const [userLoaded, setUserLoaded] = useState(false);

  onAuthStateChanged(firebaseAuth, (currentUser) => {
    if (currentUser) {
      setUser(currentUser);
    }
    setUserLoaded(true);
  });

  const [meetingData, setMeetingData] = useState(null);

  useEffect(() => {
    const getMeetingData = async () => {
      if (params.id && userLoaded) {
        const firestoreQuery = query(
          meetingsRef,
          where("meetingId", "==", params.id)
        );
        const fetchedMeetings = await getDocs(firestoreQuery);

        if (fetchedMeetings.docs.length) {
          const meeting = fetchedMeetings.docs[0].data();
          setMeetingData(meeting);
          const isCreator = meeting.createdBy === user?.uid;
          
          if (meeting.meetingType === "1-on-1") {
            if (meeting.invitedUsers[0] === user?.uid || isCreator) {
              checkMeetingDate(meeting);
            } else {
              navigate(user ? "/" : "/login");
            }
          } else if (meeting.meetingType === "video-conference") {
            const index = meeting.invitedUsers.findIndex(
              (invitedUser) => invitedUser === user?.uid
            );
            if (index !== -1 || isCreator) {
              checkMeetingDate(meeting);
            } else {
              createToast({
                title: `You are not invited to the meeting.`,
                type: "danger",
              });
              navigate(user ? "/" : "/login");
            }
          } else {
            setIsAllowed(true);
          }
        }
      }
    };

    const checkMeetingDate = (meeting) => {
      if (meeting.meetingDate === moment().format("L")) {
        setIsAllowed(true);
      } else if (moment(meeting.meetingDate).isBefore(moment().format("L"))) {
        createToast({ title: "Meeting has ended.", type: "danger" });
        navigate(user ? "/" : "/login");
      } else if (moment(meeting.meetingDate).isAfter()) {
        createToast({
          title: `Meeting is on ${meeting.meetingDate}`,
          type: "warning",
        });
        if (meeting.meetingType === "1-on-1") {
          navigate(user ? "/" : "/login");
        }
      }
    };

    getMeetingData();
  }, [params.id, user, userLoaded, createToast, navigate]);

  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const peersRef = useRef({});
  const userVideoRef = useRef();
  const peersVideoRef = useRef();
  const videoElementsRef = useRef({});

  const myMeeting = async (element) => {
    if (!meetingData) return;

    try {
      // Get user media stream with quality settings
      const videoQuality = meetingData.videoQuality || "720p";
      const audioQuality = meetingData.audioQuality || "high";

      const videoConstraints = {
        width: { ideal: videoQuality === "1080p" ? 1920 : videoQuality === "720p" ? 1280 : 640 },
        height: { ideal: videoQuality === "1080p" ? 1080 : videoQuality === "720p" ? 720 : 360 },
        frameRate: { ideal: 30 }
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          sampleRate: audioQuality === "high" ? 44100 : 16000 
        }
      });
      setLocalStream(stream);

      // Create video element first
      const userVideo = document.createElement('video');
      userVideo.muted = true;
      userVideo.autoplay = true;
      userVideo.playsInline = true;
      userVideo.style.width = '100%';
      userVideo.style.height = '100%';
      userVideoRef.current = userVideo;
      element.appendChild(userVideo);

      // Then assign stream
      userVideo.srcObject = stream;
      
      // Also store in ref for cleanup
      userVideoRef.current.srcObject = stream;

      // Create container for peers' videos
      const peersContainer = document.createElement('div');
      peersContainer.className = 'peers-container';
      peersVideoRef.current = peersContainer;
      element.appendChild(peersContainer);

      // Create controls container
      const controls = document.createElement('div');
      controls.className = 'meeting-controls';
      controls.style.position = 'fixed';
      controls.style.bottom = '20px';
      controls.style.left = '50%';
      controls.style.transform = 'translateX(-50%)';
      controls.style.display = 'flex';
      controls.style.gap = '10px';

      // Mute/unmute button
      const muteButton = document.createElement('button');
      muteButton.innerText = isMuted ? 'Unmute' : 'Mute';
      muteButton.onclick = () => {
        try {
          stream.getAudioTracks().forEach(track => {
            track.enabled = isMuted;
          });
          setIsMuted(!isMuted);
          muteButton.innerText = isMuted ? 'Mute' : 'Unmute';
        } catch (error) {
          console.error('Failed to toggle mute:', error);
        }
      };

      // Video on/off button
      const videoButton = document.createElement('button');
      videoButton.innerText = isVideoOff ? 'Video On' : 'Video Off';
      videoButton.onclick = () => {
        try {
          stream.getVideoTracks().forEach(track => {
            track.enabled = isVideoOff;
          });
          setIsVideoOff(!isVideoOff);
          videoButton.innerText = isVideoOff ? 'Video Off' : 'Video On';
        } catch (error) {
          console.error('Failed to toggle video:', error);
        }
      };

      // Connection status indicator
      const statusIndicator = document.createElement('div');
      statusIndicator.className = 'connection-status';
      statusIndicator.style.padding = '5px 10px';
      statusIndicator.style.backgroundColor = '#4CAF50';
      statusIndicator.style.color = 'white';
      statusIndicator.style.borderRadius = '4px';
      statusIndicator.innerText = 'Connected';

      controls.appendChild(muteButton);
      controls.appendChild(videoButton);
      controls.appendChild(statusIndicator);
      element.appendChild(controls);

      // Update connection status
      const updateConnectionStatus = (status) => {
        statusIndicator.innerText = status;
        statusIndicator.style.backgroundColor = 
          status === 'Connected' ? '#4CAF50' : 
          status === 'Connecting' ? '#FFC107' : '#F44336';
      };

      // Set up Firebase signaling
      const meetingRef = doc(meetingsRef, params.id);
      const signalingRef = collection(meetingRef, 'signaling');
      
      // Listen for new peers
      const unsubscribe = onSnapshot(signalingRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const signal = change.doc.data();
            if (signal.senderId === user?.uid) return;
            
            // Create peer connection
            const peer = new Peer({
              initiator: false,
              trickle: false,
              stream: stream
            });

            peer.on('signal', (data) => {
              // Send our signal back
              addDoc(signalingRef, {
                ...data,
                senderId: user?.uid,
                recipientId: signal.senderId
              });
            });

            peer.on('stream', (stream) => {
              // Clean up any existing video element for this peer
              if (videoElementsRef.current[signal.senderId]) {
                const existingVideo = videoElementsRef.current[signal.senderId];
                if (existingVideo.parentNode) {
                  existingVideo.parentNode.removeChild(existingVideo);
                }
                delete videoElementsRef.current[signal.senderId];
              }

            // Create new video element only if we don't already have one
            const existingVideo = videoElementsRef.current[signal.senderId];
            if (existingVideo) {
              // If the video element already exists, just update the stream
              existingVideo.srcObject = stream;
            } else {
              const video = document.createElement('video');
              video.srcObject = stream;
              video.autoplay = true;
              video.playsInline = true;
              video.style.width = '100%';
              video.style.height = '100%';
              video.setAttribute('data-peer-id', signal.senderId);
              
              // Add to container and store reference
              peersVideoRef.current.appendChild(video);
              videoElementsRef.current[signal.senderId] = video;
              peersRef.current[signal.senderId].videoAdded = true;
            }
            });

            peer.signal(signal);
            peersRef.current[signal.senderId] = peer;
          }
        });
      });

      // Create our own signaling offer if we're the first to join
      if (Object.keys(peersRef.current).length === 0) {
        const peer = new Peer({
          initiator: true,
          trickle: false,
          stream: stream
        });

        peer.on('signal', (data) => {
          addDoc(signalingRef, {
            ...data,
            senderId: user?.uid
          });
        });

        peer.on('stream', (stream) => {
          // Clean up any existing video element for our own stream
          if (videoElementsRef.current[user?.uid]) {
            const existingVideo = videoElementsRef.current[user?.uid];
            if (existingVideo.parentNode) {
              existingVideo.parentNode.removeChild(existingVideo);
            }
            delete videoElementsRef.current[user?.uid];
          }

          // Create new video element
          const video = document.createElement('video');
          video.srcObject = stream;
          video.autoplay = true;
          video.playsInline = true;
          video.style.width = '100%';
          video.style.height = '100%';
          video.setAttribute('data-peer-id', user?.uid);
          
          // Add to container and store reference
          peersVideoRef.current.appendChild(video);
          videoElementsRef.current[user?.uid] = video;
        });

        peersRef.current[user?.uid] = peer;
      }

      // Cleanup function
      return () => {
        unsubscribe();
        Object.values(peersRef.current).forEach(peer => peer.destroy());
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        // Clean up all video elements
        Object.values(videoElementsRef.current).forEach(video => {
          if (video && video.parentNode) {
            video.parentNode.removeChild(video);
          }
        });
        videoElementsRef.current = {};
      };
    } catch (error) {
      console.error('Media Device Error:', {
        error: error.toString(),
        name: error.name,
        message: error.message,
        stack: error.stack,
        constraints: { video: videoConstraints, audio: true }
      });
      createToast({
        title: 'Device Access Error',
        message: `Failed to access ${error.name.includes('video') ? 'camera' : 'microphone'}. Check permissions and connections.`,
        type: 'danger',
        duration: 5000
      });
      // Provide fallback UI
      const fallbackMsg = document.createElement('div');
      fallbackMsg.className = 'fallback-message';
      fallbackMsg.innerHTML = ` 
        <p>Camera/microphone access denied</p>
        <button onclick="window.location.reload()">Try Again</button>
      `;
      element.appendChild(fallbackMsg);
    }
  };

  return isAllowed ? (
    <div
      style={{
        display: "flex",
        height: "100vh",
        flexDirection: "row",
      }}
    >
      <div style={{ 
        width: "300px",
        borderRight: "1px solid #ccc",
        display: "flex",
        flexDirection: "column"
      }}>
        <Chat chatId={params.id} />
      </div>
      <div
        className="myCallContainer"
        ref={myMeeting}
        style={{ 
          width: "100%", 
          height: "100vh",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1rem",
          padding: "1rem"
        }}
      ></div>
    </div>
  ) : (
    <></>
  );
}
