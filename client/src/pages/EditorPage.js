import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import ACTIONS from '../Actions';
import Client from '../components/Client';
import Editor from '../components/Editor';
import { initSocket } from '../socket';
import {
  useLocation,
  useNavigate,
  Navigate,
  //useParams to get the roomId as parameter from params
  useParams,
} from 'react-router-dom';

const EditorPage = (props) => {
  //useRef does not cause rerendering of the component
  const socketRef = useRef(null);
  const codeRef = useRef(null);
  const location = useLocation();
  const { roomId } = useParams();
  const reactNavigator = useNavigate();
  const [clients, setClients] = useState([]);
  const [output, setOutput] = useState('');

  async function addlist() {
    var select = document.getElementById('language');

    languageList.map((language) => {
      var option = document.createElement('option');
      option.text = language.name;
      option.value = language.id;
      select.add(option);
    });
  }

  const compileHandler = async () => {
    const code = codeRef.current.toString();
    const language = document.querySelector('#language').value;
    const stdin = document
      .querySelector('#stdin')
      .value.split(/[|]+/)
      .join('\n')
      .toString();
    const response = await fetch(
      'https://judge0-ce.p.rapidapi.com/submissions',
      {
        method: 'POST',
        headers: {
          'x-rapidapi-host': 'judge0-ce.p.rapidapi.com',
          'x-rapidapi-key':
            '577f6461damsha4cf6d679bbee8cp18bfc0jsnb10b552c69bb', // Get yours for free at https://rapidapi.com/judge0-official/api/judge0-ce/
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          source_code: code,
          stdin: stdin,
          language_id: language,
        }),
      }
    );
    const jsonResponse = await response.json();

    let jsonGetSolution = {
      status: { description: 'Queue' },
      stderr: null,
      compile_output: null,
    };

    while (
      jsonGetSolution.status.description !== 'Accepted' &&
      jsonGetSolution.stderr == null &&
      jsonGetSolution.compile_output == null
    ) {
      setOutput(
        `Creating Submission ... \nSubmission Created ...\nChecking Submission Status\nstatus : ${jsonGetSolution.status.description}`
      );
      if (jsonResponse.token) {
        let url = `https://judge0-ce.p.rapidapi.com/submissions/${jsonResponse.token}?base64_encoded=true`;

        const getSolution = await fetch(url, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': 'judge0-ce.p.rapidapi.com',
            'x-rapidapi-key':
              '577f6461damsha4cf6d679bbee8cp18bfc0jsnb10b552c69bb', // Get yours for free at https://rapidapi.com/judge0-official/api/judge0-ce/
            'content-type': 'application/json',
          },
        });

        jsonGetSolution = await getSolution.json();
      }
    }
    if (jsonGetSolution.stdout) {
      const output = atob(jsonGetSolution.stdout);

      setOutput('');

      setOutput(
        (prev) =>
          (prev += `Results :\n${output}\n Execution Time : ${jsonGetSolution.time} Secs\n Memory used : ${jsonGetSolution.memory} bytes`)
      );
    } else if (jsonGetSolution.stderr) {
      const error = atob(jsonGetSolution.stderr);

      setOutput('');

      setOutput((prev) => (prev += `\n Error :${error}`));
    } else {
      const compilation_error = atob(jsonGetSolution.compile_output);

      setOutput('');

      setOutput(`\n Error :${compilation_error}`);
    }
  };

  // console.log(jsonResponse);

  //for initialisation of the socket-client
  useEffect(() => {
    addlist();
    const init = async () => {
      socketRef.current = await initSocket();
      socketRef.current.on('connect_error', (err) => handleErrors(err));
      socketRef.current.on('connect_failed', (err) => handleErrors(err));

      function handleErrors(e) {
        //on error
        console.log('socket error', e);
        toast.error('Socket connection failed, try again later.');
        reactNavigator('/');
      }

      //this is emitted and listened to on the server side
      socketRef.current.emit(ACTIONS.JOIN, {
        roomId,
        username: location.state?.username,
      });

      // Listening for joined event
      socketRef.current.on(
        ACTIONS.JOINED,
        ({ clients, username, socketId, code }) => {
          // only notify if he is not the new user that joined
          if (username !== location.state?.username) {
            toast.success(`${username} joined the room.`);
            console.log(`${username} joined`);
          }
          setClients(clients);

          // so a new user gets all the previous code when he joins for the first time
          socketRef.current.emit(ACTIONS.SYNC_CODE, {
            code: code || codeRef.current,
            socketId,
          });
        }
      );

      // Listening for disconnected
      socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
        toast.success(`${username} left the room.`);
        setClients((prev) => {
          return prev.filter((client) => client.socketId !== socketId);
        });
      });
    };
    init();

    // cleaning function
    return () => {
      socketRef.current.disconnect();
      socketRef.current.off(ACTIONS.JOINED);
      socketRef.current.off(ACTIONS.DISCONNECTED);
    };
  }, []);

  async function copyRoomId() {
    try {
      // inbuilt navigator.clipboard
      await navigator.clipboard.writeText(roomId);
      toast.success('Room ID has been copied to your clipboard');
    } catch (err) {
      toast.error('Could not copy the Room ID');
      console.error(err);
    }
  }

  async function leaveRoom(e) {
    if (props.user) {
      window.open(`${process.env.REACT_APP_API_URL}/auth/logout`, '_self');
    }

    reactNavigator('/');
  }

  if (!location.state) {
    return <Navigate to='/' />;
  }

  return (
    <div className='mainWrap'>
      <div className='aside'>
        <div className='asideInner'>
          <div className='logo'>
            <img className='logoImage' src='/cover.png' alt='logo' />
          </div>
          <h3>Connected</h3>
          <div className='clientsList'>
            {clients.map((client) => (
              <Client key={client.socketId} username={client.username} />
            ))}
          </div>
        </div>
        <button className='btn copyBtn' onClick={copyRoomId}>
          Copy ROOM ID
        </button>
        <button className='btn leaveBtn' onClick={leaveRoom}>
          Leave
        </button>
      </div>

      <div className='editorWrap'>
        <div className='actions'>
          <div className='actions__container-fluid'>
            <select id='language' className='dropdown'></select>
          </div>
        </div>
        <Editor
          socketRef={socketRef}
          roomId={roomId}
          onCodeChange={(code) => {
            codeRef.current = code;
          }}
        />
        <div>
          <input
            id='stdin'
            className='inputBox'
            placeholder="Inputs (seperated by an ' | ' symbol)"
          />
          <button className='btn copyBtn' id='compile' onClick={compileHandler}>
            Compile
          </button>
        </div>
        <div className='fakeScreen' id='opscreen'>
          <p className='line1'>
            Output<span className='cursor1'> : </span> <span> {output} </span>
          </p>
        </div>
      </div>
    </div>
  );
};

const languageList = [
  {
    id: 45,
    name: 'Assembly (NASM 2.14.02)',
  },
  {
    id: 46,
    name: 'Bash (5.0.0)',
  },
  {
    id: 47,
    name: 'Basic (FBC 1.07.1)',
  },
  {
    id: 48,
    name: 'C (GCC 7.4.0)',
  },
  {
    id: 52,
    name: 'C++ (GCC 7.4.0)',
  },
  {
    id: 49,
    name: 'C (GCC 8.3.0)',
  },
  {
    id: 53,
    name: 'C++ (GCC 8.3.0)',
  },
  {
    id: 50,
    name: 'C (GCC 9.2.0)',
  },
  {
    id: 54,
    name: 'C++ (GCC 9.2.0)',
  },
  {
    id: 51,
    name: 'C# (Mono 6.6.0.161)',
  },
  {
    id: 55,
    name: 'Common Lisp (SBCL 2.0.0)',
  },
  {
    id: 56,
    name: 'D (DMD 2.089.1)',
  },
  {
    id: 57,
    name: 'Elixir (1.9.4)',
  },
  {
    id: 58,
    name: 'Erlang (OTP 22.2)',
  },
  {
    id: 44,
    name: 'Executable',
  },
  {
    id: 59,
    name: 'Fortran (GFortran 9.2.0)',
  },
  {
    id: 60,
    name: 'Go (1.13.5)',
  },
  {
    id: 61,
    name: 'Haskell (GHC 8.8.1)',
  },
  {
    id: 62,
    name: 'Java (OpenJDK 13.0.1)',
  },
  {
    id: 63,
    name: 'JavaScript (Node.js 12.14.0)',
  },
  {
    id: 64,
    name: 'Lua (5.3.5)',
  },
  {
    id: 65,
    name: 'OCaml (4.09.0)',
  },
  {
    id: 66,
    name: 'Octave (5.1.0)',
  },
  {
    id: 67,
    name: 'Pascal (FPC 3.0.4)',
  },
  {
    id: 68,
    name: 'PHP (7.4.1)',
  },
  {
    id: 43,
    name: 'Plain Text',
  },
  {
    id: 69,
    name: 'Prolog (GNU Prolog 1.4.5)',
  },
  {
    id: 70,
    name: 'Python (2.7.17)',
  },
  {
    id: 71,
    name: 'Python (3.8.1)',
  },
  {
    id: 72,
    name: 'Ruby (2.7.0)',
  },
  {
    id: 73,
    name: 'Rust (1.40.0)',
  },
  {
    id: 74,
    name: 'TypeScript (3.7.4)',
  },
];
export default EditorPage;
