import logo from './logo.svg';
import './App.css';
import React, { Component } from 'react';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { toast, ToastContainer } from 'react-toastify';
import { ImPhoneHangUp } from 'react-icons/im';
import { BsCameraVideo, BsCameraVideoOff, BsChevronCompactLeft, BsTelephone } from 'react-icons/bs';
import { TbMicrophoneOff, TbMicrophone, TbScreenShare, TbScreenShareOff } from 'react-icons/tb';
import 'react-toastify/dist/ReactToastify.css';
import "./Styles/app.scss"
import { ConsoleLogger } from '@microsoft/signalr/dist/esm/Utils';

class App extends Component {

  state = {
    yourID: "",
    yourUserName: localStorage.getItem('user-name') ? localStorage.getItem('user-name') : "",
    users: [],
    stream: null,
    receivingCall: false,
    partner: "",
    partnerSDP: null,
    callAccepted: false,
    calling: false,
    peer: null,
    cameraOn: true,
    micOn: true,
    yourScreenShared: false,
    partnerScreenShared: false,
    screen_stream: null,
    tracks: []
  }

  baseUrl = "https://localhost:7218";
  // baseUrl = "https://chat-service.somee.com";

  userVideo = React.createRef();
  partnerVideo = React.createRef();
  screenShareVideo = React.createRef();

  componentDidMount = async () => {
    const yourUserName = this.state.yourUserName;
    if (yourUserName.length > 0) {
      // connect to signalrtc hub
      await this.startConnectionToHub(yourUserName, false);
      // get user media
      navigator.mediaDevices.getUserMedia({ video: false, audio: true }).then((stream) => {
        this.setState(
          { stream: stream, tracks: stream.getTracks() },
          () => {
            if (this.userVideo.current) {
              this.userVideo.current.srcObject = stream;
            }
          }
        );
      });
    }
  }

  componentDidUpdate = async (prevProps, prevState) => {
    if (prevState.yourUserName.length === 0 && this.state.yourUserName.length > 0) {
      // connect to signalrtc hub
      await this.startConnectionToHub(this.state.yourUserName, true);
      // get user media
      navigator.mediaDevices.getUserMedia({ video: false, audio: true }).then((stream) => {
        this.setState(
          { stream: stream, tracks: stream.getTracks() },
          () => {
            if (this.userVideo.current) {
              this.userVideo.current.srcObject = stream;
            }
          }
        );
      });
    }
  }

  componentWillUnmount = () => {
    const peer = this.state.peer;
    if (peer) {
      this.closeCall();
    }
  }

  startConnectionToHub = async (yourUserName, isNewlyConnection) => {
    console.log("connect to SignalRTC hub")
    try {
      const connection = new HubConnectionBuilder()
        .withUrl(`${this.baseUrl}/signalrtc`)
        .configureLogging(LogLevel.Information)
        .build();

      connection.on("YourID", (id) => {
        this.setState({ yourID: id });
      })

      connection.on("UsernameExisted", () => {
        toast.info("Username already existed.")
        localStorage.removeItem("user-name");
        this.setState({ yourUserName: "" });
      })

      connection.on("AllUsers", (users) => {
        this.setState({ users: users });
      })

      connection.on("ReceiveOffer", async (fromUser, sdp) => {
        console.log("Hey on client invoked")
        this.setState({
          receivingCall: true,
          partner: fromUser,
          partnerSDP: sdp
        });
        // if a peer is already connected, just re-create that peer without any accept step
        const { peer, callAccepted } = this.state;
        if (peer && callAccepted) {
          const rtcSdp = new RTCSessionDescription(JSON.parse(sdp));
          await peer.setRemoteDescription(rtcSdp).catch(this.reportError);
          this.setState({
            peer: peer
          })
        }
      });

      connection.on("ReceiveAnswer", this.handleReceiveAnswer);

      connection.on("ReceiveICECandidate", this.handleNewICECandidateMsg);

      connection.on("PartnerSharedScreen", () => {
        this.setState({
          partnerScreenShared: true
        });
      });

      connection.on("CloseCall", (user) => {
        console.log(`User ${user} has disconnect`)
        const peer = this.state.peer;
        if (this.state.peer) {
          peer.ontrack = null;
          peer.onremovetrack = null;
          peer.onicecandidate = null;
          peer.oniceconnectionstatechange = null;
          peer.onsignalingstatechange = null;
          peer.onicegatheringstatechange = null;
          peer.onnegotiationneeded = null;
        }
        this.setState({
          receivingCall: false,
          partner: "",
          partnerSignal: null,
          callAccepted: false,
          calling: false,
          peer: null,
        })
      });

      await connection.start();
      console.log('started connection')

      await connection.invoke("ConnectToSignalRTC", yourUserName, isNewlyConnection);

      this.setState({
        connection: connection
      });

    } catch (e) {
      console.log(e);
    }
  }

  // handlers for signaling server events
  handleReceiveAnswer = async (fromUser, sdp) => {
    this.setState({
      callAccepted: true
    });
    let myPeer = this.state.peer;
    const rtcSdp = new RTCSessionDescription(JSON.parse(sdp));
    await myPeer.setRemoteDescription(rtcSdp).catch(this.reportError);

    console.log('peers connected, pair: ', myPeer.getTransceivers())
    this.setState({
      peer: myPeer
    })
  }
  handleNewICECandidateMsg = async (fromUser, sdp) => {
    let myPeer = this.state.peer;
    if(myPeer) {
      const candidate = new RTCIceCandidate(JSON.parse(sdp));
      try {
        await myPeer.addIceCandidate(candidate);
        this.setState({peer: myPeer})
      } catch (e) {
        this.reportError(e);
      }
    }
  }
  // --- end of signaling handlers --- 

  createPeerConnection = () => {
    let myPeer = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:openrelay.metered.ca:80",
        },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ]
    });

    // event listeners
    // first three are required
    myPeer.onicecandidate = this.handleICECandidateEvent; // fired when local ICE layer needs you to transmit an ICE candidate to the other peer
    myPeer.ontrack = this.handleTrackEvent; // fired when new track is added to peer connection
    myPeer.onnegotiationneeded = this.handleNegotiationNeededEvent; // fired when peer want to start the session negotiation process anew, create and send an offer to the callee
    //myPeer.onremovetrack = this.handleRemoveTrack;
    myPeer.oniceconnectionstatechange = this.handleICEConnectionStateChangeEvent; // sent by the ICE layer to let you know about changes to the state of the ICE connection, this can help you know when the connection has failed, or been lost. 
    myPeer.onicegatheringstatechange = this.handleICEGatheringStateChangeEvent; // 
    myPeer.onsignalingstatechange = this.handleSignalingStateChangeEvent;

    return myPeer;
  }

  // event handlers for RTCPeerConnection
  handleNegotiationNeededEvent = async () => {
    let { connection, partner, yourUserName } = this.state;
    let myPeer = this.state.peer;
    try {
      let offer = await myPeer.createOffer();
      await myPeer.setLocalDescription(offer)
      // send offer through signaling server
      const rtcMessage = {
        from: yourUserName,
        target: partner,
        type: "video-offer",
        sdp: JSON.stringify(myPeer.localDescription)
      }
      console.log('send offer', rtcMessage)
      await connection.invoke("SendOffer", rtcMessage);
    } catch(e) {
      this.reportError(e);
    }

    // myPeer.createOffer().then((offer) => {
    //   return myPeer.setLocalDescription(offer);
    // }).then(() => {
    //   // invokes signaling server
    //   const rtcMessage = {
    //     from: yourUserName,
    //     target: partner,
    //     type: "video-offer",
    //     sdp: myPeer.localDescription
    //   }
    //   connection.invoke("SendOffer", partner, JSON.stringify(data));
    // }).catch(this.reportError);
  }
  handleICECandidateEvent = async(event) => {
    if(event.candidate) {
      const { connection, partner, yourUserName } = this.state;
      // send candidate sdp through signaling server
      const rtcMessage = {
        from: yourUserName,
        target: partner,
        type: "new-ice-candidate",
        sdp: JSON.stringify(event.candidate)
      }
      await connection.invoke("SendICECandidate", rtcMessage);
    }
  }
  handleTrackEvent = (event) => {
    console.log("receive track event", event);
    console.log("ref track event", this.partnerVideo.current)
    if(this.partnerVideo.current) {      
      this.partnerVideo.current.srcObject = event.streams[0];
    }
  }

  callPeer = (user) => {
    const stream = this.state.stream;
    this.setState({
      partner: user,
      calling: true
    });

    console.log('local stream in caller', stream);
    console.log('local tracks in caller', stream.getTracks());

    let myPeer = this.createPeerConnection();

    // get user media
    this.setState({
      peer: myPeer
    });

    stream.getTracks().forEach((track) => myPeer.addTrack(track, stream));
    //stream.getTracks().forEach(track => myPeer.addTransceiver(track, {streams: [stream]}));
  }

  acceptCall = async () => {
    const { connection, partner, partnerSDP, yourUserName, stream } = this.state;
    this.setState({
      callAccepted: true,
      receivingCall: false
    });

    let myPeer = this.createPeerConnection();

    const rtcSdp = new RTCSessionDescription(JSON.parse(partnerSDP));

    try {
      await myPeer.setRemoteDescription(rtcSdp);

      this.setState({
        peer: myPeer
      });

      console.log('local stream in accept', stream);
      console.log('local tracks in caller', stream.getTracks());

      stream.getTracks().forEach((track) => myPeer.addTrack(track, stream));
      //stream.getTracks().forEach(track => myPeer.addTransceiver(track, {streams: [stream]}));

      // create answer
      let answer = await myPeer.createAnswer();
      await myPeer.setLocalDescription(answer);
      // send answer through signaling server
      const rtcMessage = {
        from: yourUserName,
        target: partner,
        type: "video-answer",
        sdp: JSON.stringify(myPeer.localDescription)
      }
      console.log('send answer', rtcMessage)
      await connection.invoke("SendAnswer", rtcMessage);
    } catch(e) {
      this.handleGetUserMediaError(e);
    }

    this.setState({peer: myPeer});
  }

  handleGetUserMediaError = (error) => {
    console.log("get user media error:", error)
    switch(error.name) {
      case "NotFoundError":
        alert("Unable to open your call because no camera and/or microphone" +
              "were found.");
        break;
      case "SecurityError":
      case "PermissionDeniedError":
        // Do nothing; this is the same as the user canceling the call.
        break;
      default:
        toast.error(`Error opening your camera and/or microphone.`);
        break;
    }
  
    this.closeCall();
  }

  closeCall = async () => {
    const { peer, connection, partner } = this.state;
    if (peer) {
      peer.ontrack = null;
      peer.onremovetrack = null;
      peer.onicecandidate = null;
      peer.oniceconnectionstatechange = null;
      peer.onsignalingstatechange = null;
      peer.onicegatheringstatechange = null;
      peer.onnegotiationneeded = null;
    }
    this.setState({
      receivingCall: false,
      partner: "",
      partnerSignal: null,
      callAccepted: false,
      calling: false,
      peer: null,
    });
    await connection.invoke("CloseCall", partner);
  }

  rejectCall = async () => {
    const { connection, partner } = this.state;
    this.setState({
      receivingCall: false,
      partner: "",
      partnerSignal: null,
      callAccepted: false,
      calling: false,
      peer: null,
    });
    await connection.invoke("CloseCall", partner);
  }

  cameraToggle = () => {
    let { cameraOn, stream } = this.state;
    const newCameraOn = !cameraOn;
    if (newCameraOn) {
      stream.getVideoTracks().forEach((video_track) => video_track.enabled = true);
      console.log("Video tracks:", stream.getVideoTracks())
      this.setState(
        { stream: stream, cameraOn: newCameraOn },
        () => {
          if (this.userVideo.current) {
            this.userVideo.current.srcObject = stream;
          }
        }
      );
    } else {
      stream.getVideoTracks().forEach((video_track) => video_track.enabled = false);
      console.log("Video tracks:", stream.getVideoTracks())
      this.setState(
        { stream: stream, cameraOn: newCameraOn },
        () => {
          if (this.userVideo.current) {
            this.userVideo.current.srcObject = stream;
          }
        }
      );
    }
  }

  micToggle = () => {
    let { micOn, stream } = this.state;
    const newMicOn = !micOn;
    if (newMicOn) {
      stream.getAudioTracks().forEach((audio_track) => audio_track.enabled = true);
      console.log("Audio tracks:", stream.getAudioTracks())
      this.setState(
        { stream: stream, micOn: newMicOn },
        () => {
          if (this.userVideo.current) {
            this.userVideo.current.srcObject = stream;
          }
        }
      );
    } else {
      stream.getAudioTracks().forEach((audio_track) => audio_track.enabled = false);
      this.setState(
        { stream: stream, micOn: newMicOn },
        () => {
          if (this.userVideo.current) {
            this.userVideo.current.srcObject = stream;
          }
        }
      );
    }
  }

  reportError = (e) => {
    toast.error("Error occurs.");
    console.log(`Error ${e.name}: ${e.message}, ${e.stack}`);
  }

  getCurrentTracks = () => {
    console.log('current tracks:', this.state.stream.getTracks())
  }

  getCurrentTransceiver = () => {
    console.log('current Transceivers: ', this.state.peer.getTransceivers())
  }

  getTrack = () => {
    console.log('current remote peer tracks:', this.state.peer.getRemoteStreams()[0].getTracks());
  }


  render() {
    const { yourID, users, partner, calling, callAccepted, receivingCall, yourUserName } = this.state;

    const { cameraOn, micOn, yourScreenShared, partnerScreenShared } = this.state;
    console.log("show video screen area", callAccepted && (yourScreenShared || partnerScreenShared))
    return (
      <>
        <ToastContainer
          position="top-right"
          autoClose={2500}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
        />
        {
          yourUserName.length > 0 ?
            <div className='container'>
            <h1>DEVELOPMENT</h1>
              <div className='row'>
                <div className={yourScreenShared || partnerScreenShared ? 'video-wrapper self screen-shared' : 'video-wrapper self'}>
                  <video className='video-player' playsInline muted ref={this.userVideo} autoPlay />
                  <div className='video-call-controls'>
                    <button className='call-controls--btn' onClick={this.cameraToggle}>{cameraOn ? <BsCameraVideo /> : <BsCameraVideoOff />}</button>
                    <button className='call-controls--btn' onClick={this.micToggle}>{micOn ? <TbMicrophone /> : <TbMicrophoneOff />}</button>
                    <button className='call-controls--btn' onClick={this.shareScreen}>{yourScreenShared ? <TbScreenShareOff /> : <TbScreenShare />}</button>
                  </div>
                </div>
                {
                  callAccepted &&
                  <div className={yourScreenShared || partnerScreenShared ? 'video-wrapper partner screen-shared' : 'video-wrapper partner'}>
                    <video className='video-player' playsInline ref={this.partnerVideo} autoPlay />
                  </div>
                }
                {
                  calling && !callAccepted &&
                  <div className='calling-placeholder'>
                    <div className='btn-wrapper calling' onClick={this.acceptCall}>
                      <div className='btn-animation-inner'></div>
                      <div className='btn-animation-outer'></div>
                      <button className='call-btn' ><BsTelephone /></button>
                    </div>
                    <p className='calling-partner-name'>Calling {partner} ...</p>
                    <div className='btn-wrapper hang-up'>
                      <button className='hang-up-btn' onClick={this.rejectCall}><ImPhoneHangUp /></button>
                    </div>
                  </div>
                }
              </div>
              {
                callAccepted && 
                (yourScreenShared || partnerScreenShared) && 
                <div className='video-wrapper screen-share-wrapper'>
                  <span style={{marginLeft: '50%'}}>{yourScreenShared ? "your screen" : `${partner}'s screen`}</span>
                  <video className='video-player' playsInline ref={this.screenShareVideo} autoPlay />
                </div>
              }
              {
                callAccepted &&
                <div className='row hang-up-wrapper'>
                  <div className='btn-wrapper'>
                    <button className='hang-up-btn' onClick={this.closeCall}><ImPhoneHangUp /></button>
                  </div>
                </div>
              }
              <button onClick={this.getCurrentTracks}>Current tracks</button>
              <br></br>
              <button onClick={this.getTrack}>Current Tracks in remote peer stream</button>
              <br></br>
              <button onClick={this.getCurrentTransceiver}>Current Tracks in remote peer stream</button>
              {
                !callAccepted && users.filter(user => user !== yourUserName).length > 0 && !receivingCall &&
                <div className='row users-list-wrapper'>
                  Connected users:
                  <div className='users-list'>
                    {users.map(item => {
                      if (item === yourUserName) {
                        return null;
                      }
                      return (
                        <button className='user-item' key={item} onClick={() => this.callPeer(item)}><BsTelephone /> {item}</button>
                      );
                    })}
                  </div>
                </div>
              }
              {
                receivingCall && !callAccepted &&
                <div className='row incoming-call-wrapper'>
                  <div className='incoming-call-section'>
                    <h1>{partner} is calling you</h1>
                    <div className='accept-reject-call'>
                      <div className={receivingCall ? 'btn-wrapper ringing' : 'btn-wrapper'} onClick={this.acceptCall}>
                        <div className='btn-animation-inner'></div>
                        <div className='btn-animation-outer'></div>
                        <button className='call-btn' ><BsTelephone /></button>
                      </div>
                      <div className='btn-wrapper'>
                        <button className='hang-up-btn' onClick={this.rejectCall}><ImPhoneHangUp /></button>
                      </div>
                    </div>
                    <audio src="https://res.cloudinary.com/quocdatcloudinary/video/upload/v1658822519/Cool_Ringtone_ujedrd.mp3" autoPlay loop />
                  </div>
                </div>
              }
              <div className='video-call-controls mobile'>
                <button className='call-controls--btn' onClick={this.cameraToggle}>{cameraOn ? <BsCameraVideo /> : <BsCameraVideoOff />}</button>
                <button className='call-controls--btn' onClick={this.micToggle}>{micOn ? <TbMicrophone /> : <TbMicrophoneOff />}</button>
                {/* <button className='call-controls--btn' onClick={this.shareScreen}>{screenShared ? <TbScreenShareOff /> : <TbScreenShare />}</button> */}
              </div>
            </div>
            :
            <div className='container username-input-wrapper'>
              <div className='username-input-section'>
                <h1>Provide your name</h1>
                <input className='username-input' onChange={(event) => { this.setState({ userNameInput: event.target.value }) }}></input>
                <button
                  className='username-submit'
                  onClick={() => {
                    this.setState({ yourUserName: this.state.userNameInput.trim() });
                    localStorage.setItem("user-name", this.state.userNameInput.trim());
                  }}
                >
                  Join!
                </button>
              </div>

            </div>
        }
      </>
    );
  }
}

export default App;
