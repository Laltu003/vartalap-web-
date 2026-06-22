import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ref, push, update, get } from 'firebase/database';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import GroupChatWindow from '../components/GroupChatWindow';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [mobileView, setMobileView] = useState('sidebar'); // 'sidebar' | 'chat'

  // Handle media coming back from the camera page (Send to... flow)
  useEffect(() => {
    const pendingMedia = location.state?.pendingMedia;
    if (!pendingMedia || !currentUser) return;

    async function deliver() {
      const { type, url, targetType, targetId } = pendingMedia;
      const previewText = type === 'image' ? '📷 Photo' : '🎥 Video';

      if (targetType === 'user') {
        const chatId = [currentUser.uid, targetId].sort().join('_');
        await push(ref(db, `chats/${chatId}/messages`), {
          type, mediaUrl: url,
          senderId: currentUser.uid,
          timestamp: Date.now(),
          status: 'sent',
        });
        const lastMsgData = { lastMessage: previewText, lastMessageTime: Date.now(), lastMessageSender: currentUser.uid };
        await update(ref(db, `users/${currentUser.uid}/chats/${targetId}`), lastMsgData);
        await update(ref(db, `users/${targetId}/chats/${currentUser.uid}`), { ...lastMsgData, unread: true });

        const targetSnap = await get(ref(db, `users/${targetId}`));
        if (targetSnap.exists()) setSelectedUser(targetSnap.val());
        setSelectedGroup(null);
      } else if (targetType === 'group') {
        await push(ref(db, `groupMessages/${targetId}/messages`), {
          type, mediaUrl: url,
          senderId: currentUser.uid,
          senderName: currentUser.displayName || 'Unknown',
          timestamp: Date.now(),
        });
        await update(ref(db, `groups/${targetId}`), {
          lastMessage: previewText, lastMessageTime: Date.now(), lastMessageSender: currentUser.displayName || 'Unknown',
        });

        const groupSnap = await get(ref(db, `groups/${targetId}`));
        if (groupSnap.exists()) setSelectedGroup({ id: targetId, ...groupSnap.val() });
        setSelectedUser(null);
      }

      setMobileView('chat');
      toast.success('Sent!');
      // Clear the navigation state so refresh/back doesn't resend
      navigate(location.pathname, { replace: true, state: {} });
    }

    deliver().catch(err => {
      console.error(err);
      toast.error('Failed to deliver media');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, currentUser]);

  function handleSelectUser(user) {
    setSelectedUser(user);
    setSelectedGroup(null);
    setMobileView('chat');
  }

  function handleSelectGroup(group) {
    setSelectedGroup(group);
    setSelectedUser(null);
    setMobileView('chat');
  }

  function handleBack() {
    setMobileView('sidebar');
  }

  function handleContactRemoved() {
    setSelectedUser(null);
    setMobileView('sidebar');
  }

  function openCamera(target) {
    navigate('/camera', { state: { sendTarget: target } });
  }

  return (
    <div className="chat-layout">
      <Sidebar
        selectedUser={selectedUser}
        selectedGroup={selectedGroup}
        onSelectUser={handleSelectUser}
        onSelectGroup={handleSelectGroup}
        isMobileVisible={mobileView === 'sidebar'}
        onOpenCamera={() => navigate('/camera')}
      />
      {selectedGroup ? (
        <GroupChatWindow
          group={selectedGroup}
          onBack={handleBack}
          isMobileVisible={mobileView === 'chat'}
          onOpenCamera={() => openCamera({ type: 'group', id: selectedGroup.id, name: selectedGroup.name })}
        />
      ) : (
        <ChatWindow
          selectedUser={selectedUser}
          onBack={handleBack}
          isMobileVisible={mobileView === 'chat'}
          onOpenCamera={() => selectedUser && openCamera({ type: 'user', id: selectedUser.uid, name: selectedUser.username })}
          onContactRemoved={handleContactRemoved}
        />
      )}
    </div>
  );
}
