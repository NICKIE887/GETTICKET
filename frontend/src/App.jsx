import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Attendance from "./pages/Attendance";
import CreateEvent from "./pages/CreateEvent";
import EventDetail from "./pages/EventDetail";
import EventsPage from "./pages/EventsPage";
import Login from "./pages/Login";
import MyTickets from "./pages/MyTickets";
import Register from "./pages/Register";
import TicketView from "./pages/TicketView";

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/create-event" element={<CreateEvent />} />
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/:id" element={<TicketView />} />
          <Route path="/attendance/:eventId" element={<Attendance />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </main>
    </div>
  );
}