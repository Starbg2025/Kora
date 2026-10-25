import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ChannelView from '../components/ChannelView';
import type { Channel, CommunityMember, CommunityRole } from '../lib/types';

export interface ChannelOutletContext {
  communityId: string;
  myRole: CommunityRole | null;
  members: CommunityMember[];
  onToggleMembers: () => void;
  onToggleChannels: () => void;
  onBack: () => void;
}

/** Route /app/c/:communityId/:channelId : charge le salon puis affiche ChannelView. */
export default function ChannelRoute() {
  const { communityId, channelId } = useParams<{ communityId: string; channelId: string }>();
  const ctx = useOutletContext<ChannelOutletContext>();
  const { sb } = useAuth();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await sb.from('channels').select('*').eq('id', channelId).single();
      if (!alive) return;
      if (error || !data || (data as Channel).community_id !== communityId) {
        navigate(`/app/c/${communityId}`, { replace: true });
        return;
      }
      setChannel(data as Channel);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [sb, communityId, channelId, navigate]);

  if (loading || !channel) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted">Chargement du salon…</p>
      </div>
    );
  }

  // Salons vocaux : créés en base et listés, mais l'audio arrive dans une phase ultérieure.
  if (channel.type === 'voice') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-base px-6 text-center">
        <span className="text-5xl">🔊</span>
        <h2 className="text-xl font-extrabold">Salon vocal « {channel.name} »</h2>
        <p className="max-w-sm text-sm text-muted">
          Les salons vocaux arrivent avec la prochaine mise à jour de Kora. Tu peux déjà les créer et les organiser.
        </p>
        <button
          onClick={() => navigate(`/app/c/${communityId}`)}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          Retour aux salons
        </button>
      </div>
    );
  }

  return (
    <ChannelView
      communityId={ctx.communityId}
      channel={channel}
      myRole={ctx.myRole}
      members={ctx.members}
      onToggleMembers={ctx.onToggleMembers}
      onToggleChannels={ctx.onToggleChannels}
      onBack={ctx.onBack}
    />
  );
}
