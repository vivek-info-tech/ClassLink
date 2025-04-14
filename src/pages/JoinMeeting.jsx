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
      const meetingDate = moment(meeting.meetingDate, "MM/DD/YYYY");
      const today = moment();
      
      if (meetingDate.isSame(today, 'day')) {
        setIsAllowed(true);
      } else if (meetingDate.isBefore(today)) {
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
  const [connectionStatus, setConnectionStatus] = useState({});
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const peersRef = useRef({});
  const userVideoRef = useRef();
  const peersVideoRef = useRef();
  const videoElementsRef = useRef({});

  const meetingContainerRef = useRef(null);

  useEffect(() => {
    if (!meetingData || !meetingContainerRef.current) return;

    const element = meetingContainerRef.current;
    let stream;

    const setupMeeting = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);

        // Clean up existing elements
        if (userVideoRef.current) {
          if (userVideoRef.current.parentNode) {
            userVideoRef.current.parentNode.removeChild(userVideoRef.current);
          }
          if (userVideoRef.current.srcObject) {
            userVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
          }
        }

        // Create new local video element
        const userVideo = document.createElement('video');
        userVideo.srcObject = stream;
        userVideo.muted = true;
        userVideo.autoplay = true;
        userVideo.playsInline = true;
        userVideo.style.width = '100%';
        userVideo.style.height = '100%';
        userVideo.setAttribute('id', 'local-video');
        userVideoRef.current = userVideo;
        
        // Create container for peers' videos if it doesn't exist
        if (!peersVideoRef.current) {
          const peersContainer = document.createElement('div');
          peersContainer.className = 'peers-container';
          peersVideoRef.current = peersContainer;
          element.appendChild(peersContainer);
        }

        // Append user video
        if (userVideoRef.current) {
          element.appendChild(userVideoRef.current);
        }

        const meetingRef = doc(meetingsRef, params.id);
        const signalingRef = collection(meetingRef, 'signaling');
        
        const unsubscribe = onSnapshot(signalingRef, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const signal = change.doc.data();
              if (signal.senderId === user?.uid) return;
              
              const peer = new Peer({
                initiator: false,
                trickle: false,
                stream: stream
              });

              peer.on('signal', (data) => {
                addDoc(signalingRef, {
                  ...data,
                  senderId: user?.uid,
                  recipientId: signal.senderId
                });
              });

              peer.on('connect', () => {
                setConnectionStatus(prev => ({
                  ...prev,
                  [signal.senderId]: 'connected'
                }));
              });

              peer.on('error', (err) => {
                console.error('Peer error:', err);
                setConnectionStatus(prev => ({
                  ...prev,
                  [signal.senderId]: 'error'
                }));
              });

              peer.on('close', () => {
                setConnectionStatus(prev => ({
                  ...prev,
                  [signal.senderId]: 'disconnected'
                }));
              });

              peer.on('stream', (remoteStream) => {
                try {
                  console.log('Stream received from:', signal.senderId);
                  setConnectionStatus(prev => ({
                    ...prev,
                    [signal.senderId]: 'active'
                  }));
                  
                  // Stable video element handling
                  let video = videoElementsRef.current[signal.senderId];
                  if (!video) {
                    video = document.createElement('video');
                    video.autoplay = true;
                    video.playsInline = true;
                    video.style.width = '100%';
                    video.style.height = '100%';
                    video.style.objectFit = 'cover';
                    video.setAttribute('data-peer-id', signal.senderId);
                    video.setAttribute('id', `video-${signal.senderId}`);
                    
                    // Video container with loading state
                    const videoContainer = document.createElement('div');
                    videoContainer.className = 'video-container';
                    
                    // Loading indicator
                    const loadingIndicator = document.createElement('div');
                    loadingIndicator.className = 'loading-indicator';
                    loadingIndicator.innerHTML = 'Connecting...';
                    videoContainer.appendChild(loadingIndicator);
                    
                    video.className = 'video-element';
                    videoContainer.appendChild(video);
                    peersVideoRef.current.appendChild(videoContainer);
                    videoElementsRef.current[signal.senderId] = video;
                  }

                  // Smooth stream transition
                  const loadingElement = document.getElementById(`loading-${signal.senderId}`);
                  if (loadingElement) {
                    loadingElement.style.opacity = '1';
                  }
                  
                  video.style.opacity = '0';
                  video.style.transition = 'opacity 0.3s ease';
                  
                  const handleStreamReady = () => {
                    video.play()
                      .then(() => {
                        video.style.opacity = '1';
                        if (loadingElement) {
                          loadingElement.style.opacity = '0';
                          setTimeout(() => {
                            if (loadingElement.parentNode) {
                              loadingElement.parentNode.removeChild(loadingElement);
                            }
                          }, 300);
                        }
                      })
                      .catch(e => {
                        console.error('Video play failed:', e);
                        if (loadingElement) {
                          loadingElement.innerHTML = 'Reconnecting...';
                          setTimeout(() => {
                            if (video.srcObject) {
                              video.srcObject.getTracks().forEach(track => track.stop());
                              video.srcObject = null;
                            }
                            video.srcObject = remoteStream;
                          }, 1000);
                        }
                      });
                  };

                  video.onloadedmetadata = handleStreamReady;
                  video.onerror = () => {
                    if (loadingElement) {
                      loadingElement.innerHTML = 'Reconnecting...';
                      loadingElement.style.opacity = '1';
                    }
                    video.style.opacity = '0';
                  };
                  
                  // Handle stream updates more carefully
                  if (remoteStream) {
                    try {
                      // First pause the video
                      video.pause();
                      
                      // Stop existing tracks if any
                      if (video.srcObject) {
                        video.srcObject.getTracks().forEach(track => track.stop());
                      }
                      
                      // Apply new stream
                      video.srcObject = remoteStream;
                      
                      // Play with error handling
                      video.play().catch(e => {
                        console.error('Video play error:', e);
                        if (loadingElement) {
                          loadingElement.innerHTML = 'Playback Error';
                          loadingElement.style.opacity = '1';
                        }
                      });
                    } catch (error) {
                      console.error('Stream update error:', error);
                      if (loadingElement) {
                        loadingElement.innerHTML = 'Stream Error';
                        loadingElement.style.opacity = '1';
                      }
                    }
                  }
                } catch (error) {
                  console.error('Error handling remote stream:', error);
                  if (loadingElement) {
                    loadingElement.innerHTML = 'Connection Error';
                    loadingElement.style.opacity = '1';
                  }
                  video.style.opacity = '0';
                }
              });

              peer.signal(signal);
              peersRef.current[signal.senderId] = peer;
            }
          });
        });

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
            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true;
            video.playsInline = true;
            video.style.width = '100%';
            video.style.height = '100%';
            video.setAttribute('data-peer-id', user?.uid);
            peersVideoRef.current.appendChild(video);
            videoElementsRef.current[user?.uid] = video;
          });

          peersRef.current[user?.uid] = peer;
        }

        return () => {
          unsubscribe();
          Object.values(peersRef.current).forEach(peer => peer.destroy());
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }
          Object.values(videoElementsRef.current).forEach(video => {
            if (video && video.parentNode) {
              video.parentNode.removeChild(video);
            }
          });
          videoElementsRef.current = {};
        };
      } catch (error) {
        console.error('Media Device Error:', error);
        createToast({
          title: 'Device Access Error',
          message: 'Failed to access camera/microphone. Check permissions and connections.',
          type: 'danger',
          duration: 5000
        });
      }
    };

    setupMeeting();
  }, [meetingData, params.id, user?.uid, createToast]);

  useEffect(() => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      const videoTracks = localStream.getVideoTracks();
      
      audioTracks.forEach(track => {
        track.enabled = !isMuted;
      });
      
      videoTracks.forEach(track => {
        track.enabled = !isVideoOff;
      });
    }
  }, [isMuted, isVideoOff, localStream]);

  return isAllowed ? (
    <div
      style={{
        display: "flex",
        height: "100vh",
        flexDirection: "row",
        position: 'relative'
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
        ref={meetingContainerRef}
        style={{ 
          width: "100%", 
          height: "calc(100vh - 80px)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: "1rem",
          padding: "1rem",
          overflow: 'auto'
        }}
      />
      
      {/* Control buttons */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '80px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#202124',
        zIndex: 100
      }}>
        <button 
          onClick={() => setIsMuted(!isMuted)}
          style={{
            background: isMuted ? '#ea4335' : '#3c4043',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            margin: '0 10px',
            cursor: 'pointer'
          }}
        >
          {isMuted ? 'Unmute' : 'Mute'}
        </button>
        <button 
          onClick={() => setIsVideoOff(!isVideoOff)}
          style={{
            background: isVideoOff ? '#ea4335' : '#3c4043',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            margin: '0 10px',
            cursor: 'pointer'
          }}
        >
          {isVideoOff ? 'Start Video' : 'Stop Video'}
        </button>
      </div>
    </div>
  ) : null;
}
