import logo from './logo.svg';
import './App.css';
import React, { Component } from 'react';
import { SimplePeer } from 'simple-peer';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { toast, ToastContainer } from 'react-toastify';
import { ImPhoneHangUp } from 'react-icons/im';
import { BsCameraVideo, BsCameraVideoOff, BsTelephone } from 'react-icons/bs';
import { TbMicrophoneOff, TbMicrophone, TbScreenShare, TbScreenShareOff } from 'react-icons/tb';
import 'react-toastify/dist/ReactToastify.css';
import "./Styles/app.scss"

class App extends Component {

  state = {
    yourID: "",
    yourUserName: localStorage.getItem('user-name') ? localStorage.getItem('user-name') : "",
    users: [],
    stream: null,
    receivingCall: false,
    partner: "",
    partnerSignal: null,
    callAccepted: false,
    calling: false,
    peer: null,
    cameraOn: true,
    micOn: true,
    screenShared: false
  }

  // baseUrl = "https://localhost:7218";
  baseUrl = "https://chat-service.somee.com";

  userVideo = React.createRef();
  partnerVideo = React.createRef();

  componentDidMount = async() => {
    const yourUserName = this.state.yourUserName;
    if(yourUserName.length > 0)
    {
      // connect to signalrtc hub
      await this.startConnectionToHub(yourUserName, false);
      // get webcam
      navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {   
        this.setState(
          { stream: stream },
          () => {
            if (this.userVideo.current) {
              this.userVideo.current.srcObject = stream;
            } 
          }
        );
      });
    }
  }

  componentDidUpdate = async(prevProps, prevState) => {
    if(prevState.yourUserName.length === 0 && this.state.yourUserName.length > 0) {
      // connect to signalrtc hub
      await this.startConnectionToHub(this.state.yourUserName, true);
      // get webcam
      navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {   
        this.setState(
          { stream: stream },
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
    if(peer) {
      this.closePeer();
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

        connection.on("IncomingCall", (fromUser, signal) => {
          console.log("Hey on client invoked")
          this.setState({
            receivingCall: true,
            partner: fromUser,
            partnerSignal: signal
          });
        });

        connection.on("CloseCall", (user) => {
          console.log(`User ${user} has disconnect`)
          if(this.state.peer) {
            this.state.peer.destroy();
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

    } catch(e) {
      console.log(e);
    }
  }

  callPeer = (user) => {
    this.setState({
      partner: user,
      calling: true
    })
    const { stream, connection, yourUserName } = this.state;
    const peer = new window.SimplePeer({
      initiator: true,
      trickle: false,
      config: { 
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
      },
      stream: stream,
    });

    this.setState({ peer: peer });

    console.log("Peer", peer)

    peer.on("signal", data => {
      // send signaling data to other peer
      //console.log("On signal emitted, this peer want to send data to some peer")
      console.log("on signal, data is: ", data);
      connection.invoke("CallUser", user, JSON.stringify(data), yourUserName);
    });

    peer.on("stream", stream => {
      if (this.partnerVideo.current) {
        this.partnerVideo.current.srcObject = stream;
      }
    });

    connection.on("CallAccepted", (signal) => {
      this.setState({
        callAccepted: true,
      });
      peer.signal(signal);
    })
    
  }

  acceptCall = () => {
    const { connection, stream, partner, partnerSignal } = this.state;
    this.setState({
      callAccepted: true,
      receivingCall: false
    });
    const peer = new window.SimplePeer({
      initiator: false,
      trickle: false,
      config: { 
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
      },
      stream: stream,
    });

    this.setState({ peer: peer });

    peer.on("signal", data => {
      // send signaling data to other peer
      console.log("on signal, data is: ", data);
      connection.invoke("AcceptCall", partner, JSON.stringify(data));
    })

    peer.on("stream", stream => {
      this.partnerVideo.current.srcObject = stream;
    });

    peer.signal(partnerSignal);
  }

  closePeer = async () => {
    const { peer, connection, partner } = this.state;
    if(peer) {
      peer.destroy();
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
    if(newCameraOn) {
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
    if(newMicOn) {
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
      console.log("Audio tracks:", stream.getAudioTracks())
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

  render() {  
    const { yourID, users, partner, calling, callAccepted, receivingCall, yourUserName } = this.state;

    const { cameraOn, micOn, screenShared } = this.state;
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
            <div className='row'>
              <div className='video-wrapper self'>
                <video className='video-player' playsInline muted ref={this.userVideo} autoPlay /> 
                <div className='video-call-controls'>
                  <button className='call-controls--btn' onClick={this.cameraToggle}>{ cameraOn ? <BsCameraVideo/> : <BsCameraVideoOff/>}</button>
                  <button className='call-controls--btn' onClick={this.micToggle}>{ micOn ? <TbMicrophone/> : <TbMicrophoneOff/>}</button>
                  <button className='call-controls--btn'>{ screenShared ? <TbScreenShareOff/> : <TbScreenShare/>}</button>
                </div>
              </div>
              { 
                callAccepted && 
                <div className='video-wrapper partner'>
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
              <div className='row hang-up-wrapper'>
                <div className='btn-wrapper'>
                  <button className='hang-up-btn' onClick={this.closePeer}><ImPhoneHangUp /></button>
                </div>
              </div>
            }
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
                    <audio src="https://res.cloudinary.com/quocdatcloudinary/video/upload/v1658822519/Cool_Ringtone_ujedrd.mp3" autoPlay loop/>
                  </div>
              </div>  
            }
            <div className='video-call-controls mobile'>
              <button className='call-controls--btn' onClick={this.cameraToggle}>{ cameraOn ? <BsCameraVideo/> : <BsCameraVideoOff/>}</button>
              <button className='call-controls--btn' onClick={this.micToggle}>{ micOn ? <TbMicrophone/> : <TbMicrophoneOff/>}</button>
              <button className='call-controls--btn'>{ screenShared ? <TbScreenShareOff/> : <TbScreenShare/>}</button>
            </div>  
          </div>
          : 
          <div className='container username-input-wrapper'>
            <div className='username-input-section'>
              <h1>Provide your name</h1>
              <input className='username-input' onChange={(event) => {this.setState({userNameInput: event.target.value})}}></input>
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
