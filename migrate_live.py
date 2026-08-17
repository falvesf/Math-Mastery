import re

def rewrite_live_quest_student():
    with open('src/pages/LiveQuestStudent.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Imports
    content = re.sub(r"import \{[^}]*firebase/firestore[^}]*\} from 'firebase/firestore';", "import { supabase } from '../lib/supabase';", content)
    content = re.sub(r"import \{ db \} from '\.\./lib/firebase';\n", "", content)

    # getDoc(doc(db, 'quests', sessionId))
    content = re.sub(r"const qDoc = await getDoc\(doc\(db, 'quests', (.*?)\)\);(\s+)if \(!qDoc\.exists\(\)\) \{(.*?)\}(\s+)setQuest\(qDoc\.data\(\) as QuestDef\);",
                     r"const { data: qDocData } = await supabase.from('quests').select('*').eq('id', \1).single();\2if (!qDocData) {\3}\4setQuest({ id: qDocData.id, ...qDocData } as QuestDef);", content, flags=re.DOTALL)

    # getDoc(doc(db, 'live_quests', sessionId))
    content = re.sub(r"const sessionRef = doc\(db, 'live_quests', (.*?)\);(\s+)const sDoc = await getDoc\(sessionRef\);(\s+)if \(!sDoc\.exists\(\)\) \{(.*?)\}(\s+)const currentSession = sDoc\.data\(\) as LiveSession;",
                     r"const sessionRef = \1;\2const { data: sDocData } = await supabase.from('live_quests').select('*').eq('id', \1).single();\3if (!sDocData) {\4}\5const currentSession = sDocData as LiveSession;", content, flags=re.DOTALL)

    # getDoc(doc(db, 'settings', 'economy'))
    content = re.sub(r"const econSnap = await getDoc\(doc\(db, 'settings', 'economy'\)\);(\s+)if \(econSnap\.exists\(\)\) \{(.*?)\}",
                     r"const { data: econSnap } = await supabase.from('system_collections').select('data').eq('type', 'economy').single();\1if (econSnap && econSnap.data) {\2}", content, flags=re.DOTALL)

    # user_items fetch
    content = re.sub(r"const invRef = collection\(db, 'user_items'\);(\s+)const q = query\(invRef, where\('studentId', '==', userData\.uid\)\);(\s+)const invSnap = await getDocs\(q\);(\s+)const pLoaded: any\[\] = \[\];(\s+)invSnap\.docs\.forEach\(d => \{(.*?)\}\);",
                     r"const { data: invSnap } = await supabase.from('user_items').select('*').eq('student_id', userData.uid);\1const pLoaded: any[] = [];\2if (invSnap) invSnap.forEach((d: any) => {\n              const item = { ...d.data, id: d.id };\n              if (item.equipped) {\n                equippedItems.push({ docId: d.id, ...item });\n              }\n              if (item.itemType === 'consumable' && item.usableInQuest && item.gameEffect !== 'add_time') {\n                pLoaded.push({ ...item, id: d.id });\n              }\n            });", content, flags=re.DOTALL)
    
    # updateDoc(sessionRef, { [players.]: sanitizedPlayer });
    content = re.sub(r"await updateDoc\(sessionRef, \{\s+\[players\.\$\{userData\.uid\}\]: sanitizedPlayer\s+\}\);",
                     r"const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();\n          if (currSess) {\n            const players = currSess.players || {};\n            players[userData.uid] = sanitizedPlayer;\n            await supabase.from('live_quests').update({ players }).eq('id', sessionId);\n          }", content)

    # onSnapshot -> channel
    content = re.sub(r"unsub = onSnapshot\(sessionRef, \(snap\) => \{(.*?)\}\);",
                     r"const channel = supabase.channel(live_quest_).on('postgres_changes', { event: '*', schema: 'public', table: 'live_quests', filter: id=eq. }, (payload) => {\n            if (payload.eventType === 'DELETE') {\n              setError('A sessão foi encerrada pelo professor.');\n              setSession(null);\n            } else {\n              setSession(payload.new as LiveSession);\n            }\n            setLoading(false);\n          }).subscribe();\n          unsub = () => supabase.removeChannel(channel);", content, flags=re.DOTALL)

    # updateDoc handleLeave
    content = re.sub(r"const sessionRef = doc\(db, 'live_quests', sessionId\);\s+await updateDoc\(sessionRef, \{\s+\[players\.\$\{userData\.uid\}\]: deleteField\(\)\s+\}\);",
                     r"const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();\n      if (currSess && currSess.players) {\n        const players = currSess.players;\n        delete players[userData.uid];\n        await supabase.from('live_quests').update({ players }).eq('id', sessionId);\n      }", content)

    # handleAnswer updateDoc
    content = re.sub(r"await updateDoc\(doc\(db, 'live_quests', sessionId\), \{\s+\[players\.\$\{userData\.uid\}\.currentAnswer\]: optionIndex\s+\}\);",
                     r"const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();\n                  if (currSess && currSess.players) {\n                    const players = currSess.players;\n                    if (players[userData.uid]) players[userData.uid].currentAnswer = optionIndex;\n                    await supabase.from('live_quests').update({ players }).eq('id', sessionId);\n                  }", content)

    # updateDoc user
    content = re.sub(r"await updateDoc\(doc\(db, 'users', userData\.uid\), \{\s+coins: Math\.max\(0, currentCoins - lost\)\s+\}\);",
                     r"await supabase.from('users').update({ coins: Math.max(0, currentCoins - lost) }).eq('id', userData.uid);", content)

    # updateDoc user userUpdate
    content = re.sub(r"await updateDoc\(doc\(db, 'users', userData\.uid\), userUpdate\);",
                     r"await supabase.from('users').update(userUpdate).eq('id', userData.uid);", content)

    # updateDoc live_quest updates
    content = re.sub(r"await updateDoc\(doc\(db, 'live_quests', sessionId\), updates\);",
                     r"const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();\n    if (currSess && currSess.players) {\n      const players = currSess.players;\n      if (players[userData.uid]) {\n        if (updates[players..isDead] !== undefined) players[userData.uid].isDead = updates[players..isDead];\n        if (updates[players..hp] !== undefined) players[userData.uid].hp = updates[players..hp];\n      }\n      await supabase.from('live_quests').update({ players }).eq('id', sessionId);\n    }", content)

    # triggerFatality update user
    content = re.sub(r"await updateDoc\(doc\(db, 'users', userData\.uid\), \{ hearts: maxHearts \}\);",
                     r"await supabase.from('users').update({ hearts: maxHearts }).eq('id', userData.uid);", content)

    # triggerFatality update session (dead)
    content = re.sub(r"await updateDoc\(doc\(db, 'live_quests', sessionId\), \{\s+\[players\.\$\{userData\.uid\}\.isDead\]: true\s+\}\);",
                     r"const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();\n      if (currSess && currSess.players) {\n        const players = currSess.players;\n        if (players[userData.uid]) players[userData.uid].isDead = true;\n        await supabase.from('live_quests').update({ players }).eq('id', sessionId);\n      }", content)

    # triggerFatality update session (hp)
    content = re.sub(r"await updateDoc\(doc\(db, 'live_quests', sessionId\), \{\s+\[players\.\$\{userData\.uid\}\.hp\]: newHp\s+\}\);",
                     r"const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();\n      if (currSess && currSess.players) {\n        const players = currSess.players;\n        if (players[userData.uid]) players[userData.uid].hp = newHp;\n        await supabase.from('live_quests').update({ players }).eq('id', sessionId);\n      }", content)

    # triggerFatality update user (hp)
    content = re.sub(r"await updateDoc\(doc\(db, 'users', userData\.uid\), \{ hearts: newHp \}\);",
                     r"await supabase.from('users').update({ hearts: newHp }).eq('id', userData.uid);", content)

    # consume item
    content = re.sub(r"await deleteDoc\(doc\(db, 'user_items', item\.id\)\);",
                     r"await supabase.from('user_items').delete().eq('id', item.id);", content)

    # fetch powerups inline
    content = re.sub(r"updateDoc\(doc\(db, 'users', userData\.uid\), \{ coins: currentCoins \+ coinsToRescue \}\)\.catch\(console\.error\);",
                     r"supabase.from('users').update({ coins: currentCoins + coinsToRescue }).eq('id', userData.uid).catch(console.error);", content)

    # handlePowerupSelect extra_life update session
    content = re.sub(r"updateDoc\(doc\(db, 'live_quests', sessionId!\), \{\s+\[players\.\$\{userData\.uid\}\.hp\]: maxHearts\s+\}\);",
                     r"supabase.from('live_quests').select('players').eq('id', sessionId!).single().then(({ data: currSess }) => {\n        if (currSess && currSess.players) {\n          const players = currSess.players;\n          if (players[userData.uid]) players[userData.uid].hp = maxHearts;\n          supabase.from('live_quests').update({ players }).eq('id', sessionId!);\n        }\n      });", content)

    # handlePowerupSelect extra_life await update session
    content = re.sub(r"await updateDoc\(doc\(db, 'live_quests', sessionId!\), \{\s+\[players\.\$\{userData\.uid\}\.hp\]: Math\.min\(maxHearts, currentHp \+ 1\)\s+\}\);",
                     r"const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId!).single();\n                if (currSess && currSess.players) {\n                  const players = currSess.players;\n                  if (players[userData.uid]) players[userData.uid].hp = Math.min(maxHearts, currentHp + 1);\n                  await supabase.from('live_quests').update({ players }).eq('id', sessionId!);\n                }", content)

    with open('src/pages/LiveQuestStudent.tsx', 'w', encoding='utf-8') as f:
        f.write(content)

rewrite_live_quest_student()
