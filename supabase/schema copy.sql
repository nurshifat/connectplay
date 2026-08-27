create extension if not exists pgcrypto;

create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique not null,
 display_name text not null,
 avatar_url text,
 bio text default '',
 status text not null default 'online' check(status in ('online','idle','dnd','invisible')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.friendships(
 id uuid primary key default gen_random_uuid(),
 requester_id uuid not null references public.profiles(id) on delete cascade,
 receiver_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','rejected','blocked')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(requester_id,receiver_id),
 check(requester_id<>receiver_id)
);

create table if not exists public.conversations(
 id uuid primary key default gen_random_uuid(),
 kind text not null default 'dm' check(kind in ('dm','group')),
 name text,
 avatar_url text,
 created_at timestamptz not null default now()
);
create table if not exists public.conversation_members(
 conversation_id uuid references public.conversations(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key(conversation_id,user_id)
);
create table if not exists public.messages(
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid references public.conversations(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 content text not null check(char_length(content) between 1 and 4000),
 reply_to uuid references public.messages(id) on delete set null,
 edited_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.communities(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 name text not null,
 description text default '',
 icon_url text,
 invite_code text unique not null default encode(gen_random_bytes(6),'hex'),
 created_at timestamptz not null default now()
);
create table if not exists public.community_members(
 community_id uuid references public.communities(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete cascade,
 role text not null default 'member' check(role in ('owner','admin','member')),
 joined_at timestamptz not null default now(),
 primary key(community_id,user_id)
);
create table if not exists public.channels(
 id uuid primary key default gen_random_uuid(),
 community_id uuid references public.communities(id) on delete cascade,
 name text not null,
 kind text not null default 'text' check(kind in ('text','voice')),
 position int not null default 0,
 created_at timestamptz not null default now()
);
create table if not exists public.notifications(
 id uuid primary key default gen_random_uuid(),
 user_id uuid references public.profiles(id) on delete cascade,
 type text not null,
 title text not null,
 body text default '',
 read boolean not null default false,
 created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.channels enable row level security;
alter table public.notifications enable row level security;

create or replace function public.is_conversation_member(cid uuid, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.conversation_members where conversation_id=cid and user_id=uid)
$$;
create or replace function public.is_community_member(cid uuid, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.community_members where community_id=cid and user_id=uid)
$$;

-- Profile policies
 drop policy if exists profile_read on public.profiles;
 create policy profile_read on public.profiles for select to authenticated using(true);
 drop policy if exists profile_insert on public.profiles;
 create policy profile_insert on public.profiles for insert to authenticated with check(id=auth.uid());
 drop policy if exists profile_update on public.profiles;
 create policy profile_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

-- Friendship policies
 drop policy if exists friendship_read on public.friendships;
 create policy friendship_read on public.friendships for select to authenticated using(requester_id=auth.uid() or receiver_id=auth.uid());
 drop policy if exists friendship_insert on public.friendships;
 create policy friendship_insert on public.friendships for insert to authenticated with check(requester_id=auth.uid() and receiver_id<>auth.uid());
 drop policy if exists friendship_update on public.friendships;
 create policy friendship_update on public.friendships for update to authenticated using(requester_id=auth.uid() or receiver_id=auth.uid()) with check(requester_id=auth.uid() or receiver_id=auth.uid());

-- Conversation policies
 drop policy if exists conversation_read on public.conversations;
 create policy conversation_read on public.conversations for select to authenticated using(public.is_conversation_member(id));
 drop policy if exists member_read on public.conversation_members;
 create policy member_read on public.conversation_members for select to authenticated using(public.is_conversation_member(conversation_id));
 drop policy if exists message_read on public.messages;
 create policy message_read on public.messages for select to authenticated using(public.is_conversation_member(conversation_id));
 drop policy if exists message_insert on public.messages;
 create policy message_insert on public.messages for insert to authenticated with check(user_id=auth.uid() and public.is_conversation_member(conversation_id));
 drop policy if exists message_update on public.messages;
 create policy message_update on public.messages for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 drop policy if exists message_delete on public.messages;
 create policy message_delete on public.messages for delete to authenticated using(user_id=auth.uid());

-- Community policies
 drop policy if exists community_read on public.communities;
 create policy community_read on public.communities for select to authenticated using(public.is_community_member(id) or owner_id=auth.uid());
 drop policy if exists community_insert on public.communities;
 create policy community_insert on public.communities for insert to authenticated with check(owner_id=auth.uid());
 drop policy if exists community_member_read on public.community_members;
 create policy community_member_read on public.community_members for select to authenticated using(public.is_community_member(community_id));
 drop policy if exists community_member_insert on public.community_members;
 create policy community_member_insert on public.community_members for insert to authenticated with check(user_id=auth.uid() or exists(select 1 from public.communities c where c.id=community_id and c.owner_id=auth.uid()));
 drop policy if exists channel_read on public.channels;
 create policy channel_read on public.channels for select to authenticated using(public.is_community_member(community_id));
 drop policy if exists channel_owner_write on public.channels;
 create policy channel_owner_write on public.channels for all to authenticated using(exists(select 1 from public.communities c where c.id=community_id and c.owner_id=auth.uid())) with check(exists(select 1 from public.communities c where c.id=community_id and c.owner_id=auth.uid()));

-- Notifications
 drop policy if exists notification_read on public.notifications;
 create policy notification_read on public.notifications for select to authenticated using(user_id=auth.uid());
 drop policy if exists notification_update on public.notifications;
 create policy notification_update on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

-- Profile trigger. The generated username is unique even when metadata is absent.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare base text; candidate text; n integer := 0;
begin
 base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username','player'),'[^a-zA-Z0-9_]','','g'));
 if length(base)<3 then base := 'player'; end if;
 candidate := left(base,24);
 while exists(select 1 from public.profiles where username=candidate) loop
   n := n + 1; candidate := left(base,20) || '_' || n::text;
 end loop;
 insert into public.profiles(id,username,display_name) values(new.id,candidate,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'ConnectPlay User')) on conflict(id) do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Securely create/reuse a DM. The caller can only create a conversation with an accepted friend.
create or replace function public.create_or_get_dm(other_user_id uuid)
returns public.conversations
language plpgsql security definer set search_path=public
as $$
declare me uuid := auth.uid(); existing public.conversations; new_conversation public.conversations;
begin
 if me is null or other_user_id is null or me=other_user_id then raise exception 'Invalid user'; end if;
 if not exists(select 1 from public.friendships where status='accepted' and ((requester_id=me and receiver_id=other_user_id) or (requester_id=other_user_id and receiver_id=me))) then raise exception 'You must be friends before starting a conversation'; end if;
 select c.* into existing from public.conversations c where c.kind='dm' and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id)=2 and exists(select 1 from public.conversation_members where conversation_id=c.id and user_id=me) and exists(select 1 from public.conversation_members where conversation_id=c.id and user_id=other_user_id) limit 1;
 if existing.id is not null then return existing; end if;
 insert into public.conversations(kind) values('dm') returning * into new_conversation;
 insert into public.conversation_members(conversation_id,user_id) values(new_conversation.id,me),(new_conversation.id,other_user_id);
 return new_conversation;
end $$;
revoke all on function public.create_or_get_dm(uuid) from public;
grant execute on function public.create_or_get_dm(uuid) to authenticated;

-- Friend request RPCs: keep friendship writes server-side and prevent reverse-direction duplicates.
create or replace function public.send_friend_request(other_user_id uuid)
returns public.friendships
language plpgsql security definer set search_path=public
as $$
declare
  me uuid := auth.uid();
  existing public.friendships;
  created public.friendships;
begin
  if me is null or other_user_id is null or me = other_user_id then
    raise exception 'Invalid friend request';
  end if;
  if not exists(select 1 from public.profiles where id=other_user_id) then
    raise exception 'User not found';
  end if;
  select f.* into existing
  from public.friendships f
  where (f.requester_id=me and f.receiver_id=other_user_id)
     or (f.requester_id=other_user_id and f.receiver_id=me)
  limit 1;
  if existing.id is not null then
    if existing.status='rejected' and existing.requester_id=me then
      update public.friendships set status='pending', updated_at=now() where id=existing.id returning * into created;
      return created;
    end if;
    raise exception 'A friendship or request already exists';
  end if;
  insert into public.friendships(requester_id,receiver_id,status)
  values(me,other_user_id,'pending')
  returning * into created;
  return created;
end $$;

create or replace function public.respond_friend_request(friendship_id uuid, new_status text)
returns public.friendships
language plpgsql security definer set search_path=public
as $$
declare
  me uuid := auth.uid();
  row public.friendships;
  updated public.friendships;
begin
  if me is null or new_status not in ('accepted','rejected','blocked') then
    raise exception 'Invalid friend request response';
  end if;
  select * into row from public.friendships where id=friendship_id for update;
  if row.id is null then raise exception 'Friend request not found'; end if;
  if row.receiver_id <> me or row.status <> 'pending' then
    raise exception 'You cannot respond to this friend request';
  end if;
  update public.friendships set status=new_status, updated_at=now() where id=friendship_id returning * into updated;
  return updated;
end $$;

revoke all on function public.send_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;
revoke all on function public.respond_friend_request(uuid,text) from public;
grant execute on function public.respond_friend_request(uuid,text) to authenticated;

-- Realtime
 do $$ begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end $$;
 do $$ begin alter publication supabase_realtime add table public.friendships; exception when duplicate_object then null; end $$;
 do $$ begin alter publication supabase_realtime add table public.conversation_members; exception when duplicate_object then null; end $$;
