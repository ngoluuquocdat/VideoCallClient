import logo from './logo.svg';
import './App.css';
import React, { Component } from 'react';
import { Peer } from 'simple-peer';
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
    callAccepted: false
  }

  baseUrl = "https://localhost:7218";

  userVideo = React.createRef();
  partnerVideo = React.createRef();
  socket = React.createRef();

  componentDidMount = async() => {
    // connect to signalrtc hub
    await this.startConnectionToHub();
    // get webcam
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
      this.setState({ stream: stream });
      if (this.userVideo.current) {
        this.userVideo.current.srcObject = stream;
      }
    });
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
          this.setState({
            receivingCall: true,
            caller: fromUser,
            callerSignal: signal
          });
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
    const { stream, connection, yourID } = this.state;
    const peer = new Peer({
      initiator: true,
      trickle: false,
      config: {
        iceServers: [
            {
                urls: "stun:numb.viagenie.ca",
                username: "sultan1640@gmail.com",
                credential: "98376683"
            },
            {
                urls: "turn:numb.viagenie.ca",
                username: "sultan1640@gmail.com",
                credential: "98376683"
            }
        ]
    },
      stream: stream,
    });

    peer.on("signal", data => {
      connection.invoke("CallUser", id, data, yourID);
    })

    peer.on("stream", stream => {
      if (this.partnerVideo.current) {
        this.partnerVideo.current.srcObject = stream;
      }
    });

    connection.on("CallAccepted", (signal) => {
      this.setState({
        callAccepted: true
      });
      peer.signal(signal);
    })
  }

  acceptCall = () => {
    const { connection, stream, caller, callerSignal } = this.state;
    this.setState({
      callAccepted: true
    });
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
    });
    peer.on("signal", data => {
      connection.invoke("AcceptCall", caller, data);
    })

    peer.on("stream", stream => {
      this.partnerVideo.current.srcObject = stream;
    });

    peer.signal(callerSignal);
  }

  render() {  
    const { yourID, currentUser, users, stream, caller, callAccepted, receivingCall } = this.state;

    return (
      <Container>
        Video call 
        <Row>
          { stream && <Video playsInline muted ref={this.userVideo} autoPlay /> }
          { callAccepted && <Video playsInline ref={this.partnerVideo} autoPlay />}
        </Row>
        <Row>
          {Object.keys(users).map(key => {
            if (key === yourID) {
              return null;
            }
            return (
              <button onClick={() => this.callPeer(key)}>Call {key}</button>
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
      </Container>
    );
  }
}

export default App;
