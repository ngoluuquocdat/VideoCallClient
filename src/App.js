import logo from './logo.svg';
import './App.css';
import React, { Component } from 'react';
import { SimplePeer } from 'simple-peer';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import styled from "styled-components";
import { ImPhoneHangUp } from 'react-icons/im';
import { BsCameraVideo, BsCameraVideoOff, BsTelephone } from 'react-icons/bs';
import { TbMicrophoneOff, TbMicrophone, TbScreenShare, TbScreenShareOff } from 'react-icons/tb';
import "./Styles/app.scss"

const Container = styled.div`
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
`;

const Row = styled.div`
  display: flex;
  width: 100%;
`;

const Video = styled.video`
  border: 1px solid blue;
  width: 50%;
  height: 80%;
`;
class App extends Component {

  state = {
    yourID: "",
    users: [],
    stream: null,
    receivingCall: false,
    partner: "",
    partnerSignal: null,
    callAccepted: false,
    calling: false,
    peer: {},
    cameraOn: true,
    micOn: true,
    screenShared: false
  }

  // baseUrl = "https://localhost:7218";
  baseUrl = "https://chat-service.somee.com";

  userVideo = React.createRef();
  partnerVideo = React.createRef();

  ringtone = new Audio("./Assets/")

  componentDidMount = async() => {
    // connect to signalrtc hub
    await this.startConnectionToHub();
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

  componentWillUnmount = () => {
    const peer = this.state.peer;
    if(peer) {
      this.closePeer();
    }
  }

  startConnectionToHub = async () => {
    console.log("connect to SignalRTC hub")
    try {
        const connection = new HubConnectionBuilder()
        .withUrl(`${this.baseUrl}/signalrtc`)
        .configureLogging(LogLevel.Information)
        .build();

        connection.on("YourID", (id) => {
          this.setState({ yourID: id });
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
          this.state.peer.destroy();
          this.setState({
            receivingCall: false,
            partner: "",
            partnerSignal: null,
            callAccepted: false,
            calling: false,
            peer: {},
          })
        });

        await connection.start();
        console.log('started connection')

        await connection.invoke("YourID");

        this.setState({
            connection: connection
        });

    } catch(e) {
      console.log(e);
    }
  }

  callPeer = (id) => {
    this.setState({
      partner: id,
      calling: true
    })
    const { stream, connection, yourID } = this.state;
    const peer = new window.SimplePeer({
      initiator: true,
      trickle: false,
      stream: stream,
    });

    this.setState({ peer: peer });

    peer.on("signal", data => {
      // send signaling data to other peer
      //console.log("On signal emitted, this peer want to send data to some peer")
      console.log("on signal, data is: ", data);
      connection.invoke("CallUser", id, JSON.stringify(data), yourID);
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
    peer.destroy();
    this.setState({
      receivingCall: false,
      partner: "",
      partnerSignal: null,
      callAccepted: false,
      calling: false,
      peer: {},
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
      peer: {},
    });
    await connection.invoke("CloseCall", partner);
  }

  cameraToggle = () => {

  }

  micToggle = () => {
    let { micOn, cameraOn, stream } = this.state;
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
    const { yourID, users, stream, partner, calling, callAccepted, receivingCall } = this.state;
    const { cameraOn, micOn, screenShared } = this.state;
    return (
      <Container>
        Video call 
        <Row>
          <div className='video-wrapper'>
            <video className='video-player' playsInline muted ref={this.userVideo} autoPlay /> 
            <div className='video-call-controls'>
              <button className='call-controls--btn' onClick={this.cameraToggle}>{ cameraOn ? <BsCameraVideoOff/> : <BsCameraVideo/>}</button>
              <button className='call-controls--btn' onClick={this.micToggle}>{ micOn ? <TbMicrophoneOff/> : <TbMicrophone/>}</button>
              <button className='call-controls--btn'>{ screenShared ? <TbScreenShareOff/> : <TbScreenShare/>}</button>
            </div>
          </div>
          { 
            callAccepted && 
            <div className='video-wrapper'>
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
            </div>
          }
        </Row>
        <Row>
        {
          callAccepted &&
          <div className='btn-wrapper'>
            <button className='hang-up-btn' onClick={this.closePeer}><ImPhoneHangUp /></button>
          </div>
        }
        </Row>
        {
          !callAccepted && users.filter(user => user !== yourID).length > 0 &&
          <Row>
            Connected users:
            {users.map(item => {
              if (item === yourID) {
                return null;
              }
              return (
                <button className='call-btn1' key={item} onClick={() => this.callPeer(item)}><BsTelephone /> {item}</button>
              );
            })}
          </Row>
        }
        <Row>
          { 
            receivingCall && !callAccepted && 
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
          }
        </Row>    
      </Container>
    );
  }
}

export default App;
