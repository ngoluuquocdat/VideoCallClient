import logo from './logo.svg';
import './App.css';
import React, { Component } from 'react';
import { SimplePeer } from 'simple-peer';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { toast, ToastContainer } from 'react-toastify';
import { ImPhoneHangUp } from 'react-icons/im';
import { BsCameraVideo, BsCameraVideoOff, BsChevronCompactLeft, BsTelephone } from 'react-icons/bs';
import { TbMicrophoneOff, TbMicrophone, TbScreenShare, TbScreenShareOff } from 'react-icons/tb';
import 'react-toastify/dist/ReactToastify.css';
import "./Styles/app.scss"
import { ConsoleLogger } from '@microsoft/signalr/dist/esm/Utils';

class App extends Component {

  game = "Valorant-LOL";

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
    yourScreenShared: false,
    partnerScreenShared: false,
    screen_stream: null
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
      // get webcam
      navigator.mediaDevices.getUserMedia({ video: false, audio: true }).then((stream) => {
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

  componentDidUpdate = async (prevProps, prevState) => {
    if (prevState.yourUserName.length === 0 && this.state.yourUserName.length > 0) {
      // connect to signalrtc hub
      await this.startConnectionToHub(this.state.yourUserName, true);
      // get webcam
      navigator.mediaDevices.getUserMedia({ video: false, audio: true }).then((stream) => {
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
    if (peer) {
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
        // if a peer is already connected, just re-create that peer without any accept step
        const { peer, callAccepted } = this.state;
        if (peer && callAccepted) {
          peer.signal(signal);
        }
      });

      connection.on("PartnerSharedScreen", () => {
        this.setState({
          partnerScreenShared: true
        });
      });

      connection.on("CloseCall", (user) => {
        console.log(`User ${user} has disconnect`)
        if (this.state.peer) {
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

    } catch (e) {
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

    peer.on("signal", data => {
      // send signaling data to other peer
      //console.log("On signal emitted, this peer want to send data to some peer")
      console.log("on signal, data is: ", data);
      connection.invoke("CallUser", user, JSON.stringify(data), yourUserName);
    });

    peer.on("stream", stream => {
      const { peer, partnerScreenShared } = this.state;
      if(partnerScreenShared) {
        peer.streams = [...peer.streams, stream];
        this.screenShareVideo.current.srcObject = stream;
        console.log("screen stream received")
      } else {
        this.partnerVideo.current.srcObject = stream;
        console.log("video call stream received")
      }
    });

    // peer.on("stream", stream => {
    //   console.log('stream audios', stream.getAudioTracks());
    //   console.log('stream videos', stream.getVideoTracks());
    //   // set stream and track for video call
    //   let video_audio_call_stream = new MediaStream();
    //   video_audio_call_stream.addTrack(stream.getAudioTracks()[0]);
    //   //video_audio_call_stream.addTrack(stream.getVideoTracks()[0]);
    //   this.partnerVideo.current.srcObject = video_audio_call_stream;

    //   if(stream.getVideoTracks().length > 0) {  // change it to check if screen shared
    //     let screen_stream = new MediaStream();
    //     screen_stream.addTrack(stream.getVideoTracks().at(-1));
    //     this.screenShareVideo.current.srcObject = screen_stream;
    //   }

    //   // if(stream.getVideoTracks().length > 1) {
    //   //   // set stream and track for screen share
    //   //   let screen_stream = new MediaStream();
    //   //   screen_stream.addTrack(stream.getVideoTracks()[1]);
    //   //   this.screenShareVideo.current.srcObject = screen_stream;
    //   // }
    // });

    
    // peer.on("track", (track, stream) => {
    //   console.log('on track fired')
    //   peer.streams[0].addTrack(track);
    //   console.log('on track added track')
    // })

    connection.on("CallAccepted", (signal) => {
      this.setState({
        callAccepted: true,
      });
      peer.signal(signal);
    })

    this.setState({ peer: peer });

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

    peer.on("signal", data => {
      // send signaling data to other peer
      console.log("on signal, data is: ", data);
      connection.invoke("AcceptCall", partner, JSON.stringify(data));
    });

    peer.on("stream", stream => {
      const { peer, partnerScreenShared } = this.state;
      if(partnerScreenShared) {
        peer.streams = [...peer.streams, stream];
        this.screenShareVideo.current.srcObject = stream;
        console.log("screen stream received")
      } else {
        console.log('on stream accept', this.partnerVideo.current)
        this.partnerVideo.current.srcObject = stream;
        console.log("video call stream received")
      }
    });

    // peer.on("stream", stream => {
    //   console.log('stream audios', stream.getAudioTracks());
    //   console.log('stream videos', stream.getVideoTracks());

    //   // set stream and track for video call
    //   let video_audio_call_stream = new MediaStream();
    //   video_audio_call_stream.addTrack(stream.getAudioTracks()[0]);
    //   //video_audio_call_stream.addTrack(stream.getVideoTracks()[0]);
    //   this.partnerVideo.current.srcObject = video_audio_call_stream;

    //   if(stream.getVideoTracks().length > 0) {
    //     let screen_stream = new MediaStream();
    //     screen_stream.addTrack(stream.getVideoTracks().at(-1));
    //     this.screenShareVideo.current.srcObject = screen_stream;
    //   }


    //   // if(stream.getVideoTracks().length > 1) {
    //   //   // set stream and track for screen share
    //   //   let screen_stream = new MediaStream();
    //   //   screen_stream.addTrack(stream.getVideoTracks()[1]);
    //   //   this.screenShareVideo.current.srcObject = screen_stream;
    //   // }
    // });

    // peer.on("track", (track, stream) => {
    //   console.log('on track fired, track: ', track)
    //   peer.streams[0].addTrack(track);
    //   console.log('on track added track, peer tracks: ', peer.streams[0].getTracks())
    // })

    peer.signal(partnerSignal);

    this.setState({ peer: peer });
  }

  closePeer = async () => {
    const { peer, connection, partner } = this.state;
    if (peer) {
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

  // shareScreen = async () => {
  //   console.log('share screen')
  //   let peer = this.state.peer;
  //   let connection = this.state.connection;
  //   let partner = this.state.partner;
  //   // let stream = this.state.stream;
  //   let stream = peer.streams[0];
  //   console.log('before add screen track', stream.getTracks())
  //   navigator.mediaDevices.getDisplayMedia({ cursor: true }).then( async screen_stream => {
  //     const screen_track = screen_stream.getVideoTracks()[0];
  //     console.log('track from local screen stream', screen_track)
  //     // add screen stream to current peer
  //     // if(peer) {
  //     //   peer.addTrack(screen_track, stream);
  //     //   console.log('peer add track done')
  //     //   console.log('after add track, tracks:', stream.getTracks())s
  //     // }

  //     stream.addTrack(screen_track);
  //     console.log('after add track, tracks:', stream.getTracks());

  //     //peer.removeStream(stream);
  //     peer.addStream(stream);

  //     await connection.invoke("ShareScreen", partner);

  //     this.setState({
  //         screen_stream: screen_stream,
  //         yourScreenShared: true,
  //         stream: stream
  //       },
  //       () => {
  //         if (this.screenShareVideo.current) {
  //           this.screenShareVideo.current.srcObject = screen_stream;
  //         }
  //       });
  //   });
  // }

  shareScreen = () => {
      console.log('share screen')
      const { peer, connection, partner } = this.state;
      let current_stream = this.state.stream;
      navigator.mediaDevices.getDisplayMedia({ cursor: true }).then(async screen_stream => {
        await connection.invoke("ShareScreen", partner);
        // add screen stream to current peer
        if(peer) {
          peer.addStream(screen_stream);
        }
  
        this.setState({
            screen_stream: screen_stream,
            yourScreenShared: true,
            stream: current_stream,
            peer: peer
          },
          () => {
            if (this.screenShareVideo.current) {
              this.screenShareVideo.current.srcObject = screen_stream;
            }
          });
      });
  }

  getCurrentTracks = () => {
    console.log('current local tracks:', this.state.stream.getTracks())
  }

  getCurrentTransceiver = () => {
    console.log('current Transceivers: ', this.state.peer._pc.getTransceivers())
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
                    <button className='hang-up-btn' onClick={this.closePeer}><ImPhoneHangUp /></button>
                  </div>
                </div>
              }
                <button onClick={this.getCurrentTracks}>Current tracks DEVELOPMENT</button>
                <br></br>
                <button onClick={this.getCurrentTransceiver}>Current Transceiver</button>
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
