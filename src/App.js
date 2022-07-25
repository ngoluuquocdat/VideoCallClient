import logo from './logo.svg';
import './App.css';
import React, { Component } from 'react';
import { SimplePeer } from 'simple-peer';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import styled from "styled-components";

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
  height: 50%;
`;
class App extends Component {

  state = {
    yourID: "",
    users: [],
    stream: null,
    receivingCall: false,
    caller: "",
    callerSignal: null,
    callAccepted: false,
    peer: {},
  }

  baseUrl = "https://localhost:7218";

  userVideo = React.createRef();
  partnerVideo = React.createRef();
  // socket = React.createRef();

  componentDidMount = async() => {
    // connect to signalrtc hub
    await this.startConnectionToHub();
    // get webcam
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {   
      // if (this.userVideo.current) {
      //   this.userVideo.current.srcObject = stream;
      // } 
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

  startConnectionToHub = async (currentUser) => {
    console.log("connect to RTC hub")
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

        connection.on("Hey", (fromUser, signal) => {
          console.log("Hey on client invoked")
          this.setState({
            receivingCall: true,
            caller: fromUser,
            callerSignal: signal
          });
        });

        connection.on("CloseCall", (user) => {
          console.log(`User ${user} has disconnect`)
          this.state.peer.destroy();
          this.setState({
            receivingCall: false,
            caller: "",
            callerSignal: null,
            callAccepted: false,
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
      targetUser: id
    })
    const { stream, connection, yourID } = this.state;
    const peer = new window.SimplePeer({
      initiator: true,
      trickle: false,
      stream: stream,
    });

    this.setState({ peer: peer });

    peer.on("signal", data => {
      connection.invoke("CallUser", id, JSON.stringify(data), yourID);
    })

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
    const { connection, stream, caller, callerSignal } = this.state;
    this.setState({
      callAccepted: true
    });
    const peer = new window.SimplePeer({
      initiator: false,
      trickle: false,
      stream: stream,
    });

    this.setState({ peer: peer });

    peer.on("signal", data => {
      connection.invoke("AcceptCall", caller, JSON.stringify(data));
    })

    peer.on("stream", stream => {
      this.partnerVideo.current.srcObject = stream;
    });

    peer.signal(callerSignal);
  }

  closePeer = async () => {
    const { peer, connection, caller, targetUser } = this.state;
    peer.destroy();
    this.setState({
      receivingCall: false,
      caller: "",
      callerSignal: null,
      callAccepted: false,
      peer: {},
    })
    let toUser = caller.length > 0 ? caller : targetUser;
    await connection.invoke("CloseCall", toUser);
  }

  render() {  
    const { yourID, currentUser, users, stream, caller, callAccepted, receivingCall } = this.state;
    console.log('user video ref', this.userVideo);
    console.log('partner video ref', this.partnerVideo);
    return (
      <Container>
        Video call 
        <Row>
          { stream && <Video playsInline muted ref={this.userVideo} autoPlay /> }
          { callAccepted && <Video playsInline ref={this.partnerVideo} autoPlay />}
        </Row>
        <Row>
          {users.map(item => {
            if (item === yourID) {
              return null;
            }
            return (
              <button key={item} onClick={() => this.callPeer(item)}>Call {item}</button>
            );
          })}
        </Row>
        <Row>
          { 
            receivingCall && 
            <div>
              <h1>{caller} is calling you</h1>
              <button onClick={this.acceptCall}>Accept</button>
            </div>
          }
        </Row>
        <button onClick={this.closePeer}>Close call</button>
      </Container>
    );
  }
}

export default App;
