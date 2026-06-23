import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';

export default function ChatPage() {
  const [selectedUser, setSelectedUser] = useState(null);
  const [mobileView, setMobileView] = useState('sidebar'); // 'sidebar' | 'chat'

  function handleSelectUser(user) {
    setSelectedUser(user);
    setMobileView('chat');
  }

  function handleBack() {
    setMobileView('sidebar');
  }

  return (
    <div className="chat-layout">
      <Sidebar
        selectedUser={selectedUser}
        onSelectUser={handleSelectUser}
        isMobileVisible={mobileView === 'sidebar'}
      />
      <ChatWindow
        selectedUser={selectedUser}
        onBack={handleBack}
        isMobileVisible={mobileView === 'chat'}
      />
    </div>
  );
}
