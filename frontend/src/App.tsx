import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import SocketDemo from './components/SocketDemo';
import './App.css';

const Home = () => (
  <div>
    <h1>WoodieCampus - Home</h1>
    <p>Welcome to WoodieCampus platform</p>
    <p>A comprehensive educational platform with real-time communication features.</p>
  </div>
);

const About = () => (
  <div>
    <h1>About</h1>
    <p>WoodieCampus - Educational platform</p>
    <p>Built with React, Node.js, PostgreSQL, Redis, and Socket.io for real-time collaboration.</p>
  </div>
);

function App() {
  return (
    <Router>
      <div>
        <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc' }}>
          <Link to="/" style={{ marginRight: '1rem' }}>Home</Link>
          <Link to="/about" style={{ marginRight: '1rem' }}>About</Link>
          <Link to="/socket-demo">Socket Demo</Link>
        </nav>
        
        <main style={{ padding: '2rem' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/socket-demo" element={<SocketDemo />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App
