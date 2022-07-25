import logo from './logo.svg';
import './App.css';
import { Peer } from 'simple-peer';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

function App1() {

  state = {
    connection: {},
    newPeer: { userName: '', connectionId: '' },
    helloAnswer: { userName: '', connectionId: '' },
    disconnectedPeer: { userName: '', connectionId: '' },
    signalInfo: { user: '', signal: '' },
    users: [],
    stream: {}, // video stream from getUserMedia()
    onSignalToSend: { id: '', data: '' },
    onStream: { id: '', data: '' },
    onConnect: { id: '', data: '' },
    onData: { id:'', data: '' },
    currentPeer: {},
    currentUser: ''
  }

  baseUrl = "https://localhost:7218";

  startConnection = async (currentUser) => {
    console.log("connect to RTC hub")
    try {
        const connection = new HubConnectionBuilder()
        .withUrl(`${this.baseUrl}/signalrtc`)
        .configureLogging(LogLevel.Information)
        .build();

        connection.on("NewUserArrived", (data) => {
          this.setState({ newPeer: JSON.parse(data) });
        })

        connection.on("UserSaidHello", (data) => {
          this.setState({ helloAnswer: JSON.parse(data) });
        })

        connection.on("UserDisconnect", (data) => {
          this.setState({ disconnectedPeer: JSON.parse(data) });
        })

        connection.on("SendSignal", (user, signal) => {
          this.setState({ signalInfo: {user, signal} });
        })

        await connection.start();
        console.log('started connection')

        await connection.invoke("NewUser", currentUser);

        this.setState({
            connection: connection
        });

    } catch(e) {
      console.log(e);
    }
  }

  sendSignalToUser = async(signal, user) => {
    const connection = this.state.connection;
    try {
      await connection.invoke("SendSignal", signal, user);
    } catch(e) {
      console.log(e);
    }
  }

  sayHello = async(userName, newUser) => {
    const connection = this.state.connection;
    try {
      await connection.invoke("HelloUser", userName, newUser);
    } catch(e) {
      console.log(e);
    }
  }

  newUserJoin = (newUser) => {
    // param user: { userName: '', connectionId: '' }
    let users = [...this.state.users];
    this.setState({
      users: [...users, newUser]
    });
  }

  disconnectedUser = (user) => {
    // param user: { userName: '', connectionId: '' }
    let users = [...this.state.users];
    users = users.filter(x => x.connectionId === user.connectionId);
    this.setState({
      users: users
    });
  }

  createPeer = (stream, userId, initiator) => {
    const peer = new Peer({ initiator, stream });

    peer.on('signal', data => {
      const stringData = JSON.stringify(data);
      this.setState({ onSignalToSend: {id: userId, data: stringData} })
    });

    peer.on('stream', data => {
      console.log('on stream', data);
      this.setState({ onStream: {id: userId, data}})
    });

    peer.on('connect', () => {
      this.setState({ onConnect: { id: userId, data: null } })
    });

    peer.on('data', data => {
      this.setState({ onData: { id: userId, data } })
    });

    return peer;
  }

  signalPeer = (userId, signal, stream) => {
    const signalObject = JSON.parse(signal);
    let currentPeer = this.state.currentPeer;
    if (currentPeer) {
      currentPeer.signal(signalObject);
    } else {
      currentPeer = this.createPeer(stream, userId, false);
      currentPeer.signal(signalObject);
      this.setState({ currentPeer: currentPeer });
    }
  }

  inputCurrentUser = (event) => {
    this.setState({ currentUser: event.target.value })
  }

  saveUsername = async() => {
    const currentUser = this.state.currentUser;
    try {
      await this.startConnection(currentUser);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      this.setState({ stream: stream });
    } catch (error) {
      console.error(`Can't join room, error ${error}`);
    }
  }

  userClicked = (connectionId) => {
    const peer = this.rtcService.createPeer(this.stream, connectionId, true);
    this.setState({
      currentPeer = peer
    })
  }

  render() {  
    const {currentUser, users} = this.state;

    return (

  
      <div className="App">
        <div class="container-fluid">
          <h1>SignalRTC</h1>
          <div class="row">
            <div class="col-5">
              <div class="row">
                <div class="col">
                  <input onChange={this.inputCurrentUser} required placeholder="UserName" type="text"/>
                </div>
                <div class="col">
                  <div class="btn-group" role="group" aria-label="button group">
                    <button disabled={!currentUser} onClick={this.saveUsername} type="button"
                      class="btn btn-sm btn-primary">Save</button>
                  </div>
                </div>
              </div>
              <div class="row">
                <div class="col">
                <ul class="list-group mt-4">
                  {
                    users.map(item => {
                      return (
                        <li class="list-group-item" onClick={() => this.userClicked(item.connectionId)}>
                          {item.userName}
                        </li>
                      )
                    })
                  }
                  
                </ul>
                </div>
              </div>
            </div>
            <div class="col-7">
              <div class="row">
                <div class="col-8">
                  {/* <input [(ngModel)]="dataString" required placeholder="Write a message" type="text"> */}
                </div>
                <div class="col-4">
                  {/* <button (click)="sendMessage()" type="button" class="btn btn-sm btn-secondary">Send</button> */}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default App1;
