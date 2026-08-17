const fs = require('fs');

let admin = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf-8');
const oldAdminStr = `  const handleSaveStudent = async () => {
    if (!editingStudent) return;
    const userRef = doc(db, 'users', editingStudent.uid);
    const updateData: any = { name: editName, classId: editClass, role: editRole };
    
    // Promovendo para equipe concede 50k XP
    if (editRole !== 'student' && editingStudent.role === 'student') {
      updateData.xp = 50000;
      updateData.coins = Math.max(50000, editingStudent.coins || 0);
    }
    
    await updateDoc(userRef, updateData);
    setEditingStudent(null);
    fetchStudents();
  };`;
const newAdminStr = `  const handleSaveStudent = async () => {
    if (!editingStudent) return;
    const updateData: any = { name: editName, classId: editClass, role: editRole };
    
    // Promovendo para equipe concede 50k XP
    if (editRole !== 'student' && editingStudent.role === 'student') {
      updateData.xp = 50000;
      updateData.coins = Math.max(50000, editingStudent.coins || 0);
    }
    
    await supabase.from('users').update(updateData).eq('id', editingStudent.uid);
    setEditingStudent(null);
    fetchStudents();
  };`;
admin = admin.replace(oldAdminStr, newAdminStr);
fs.writeFileSync('src/pages/AdminDashboard.tsx', admin, 'utf-8');

let live = fs.readFileSync('src/pages/LiveQuestStudent.tsx', 'utf-8');
const oldEconStr = `        // Fetch Economy
        const econSnap = await getDoc(doc(db, 'settings', 'economy'));
        if (econSnap.exists()) {
          setEconomySettings(econSnap.data());
        }`;
const newEconStr = `        // Fetch Economy
        const { data: econSnap } = await supabase.from('system_collections').select('data').eq('type', 'economy').single();
        if (econSnap && econSnap.data) {
          setEconomySettings(econSnap.data);
        }`;
live = live.replace(oldEconStr, newEconStr);

const oldHandleAnswerStr = `    const updates: any = {
      [\`players.\${userData.uid}.answerTime\`]: answerTime,
      [\`players.\${userData.uid}.score\`]: newScore,
      [\`players.\${userData.uid}.xp\`]: newXp,
      [\`players.\${userData.uid}.sessionEarnedXp\`]: newSessionEarnedXp,
    };

    if (isCorrect) {
      const power = 1;
      updates.monsterHp = increment(-power);
      
      if (economySettings?.coinsDropInCombat) {
        const dmg = 1;
        const rankObj = getRankForXp(userData?.xp || 0);
        const rankIndex = Math.max(1, RANKS.findIndex(r => r.name === rankObj.name));
        const maxCoins = rankIndex * dmg;
        const dropped = Math.floor(Math.random() * maxCoins) + 1;
        setCoinsToRescue(dropped);
      }

      try {
        await updateDoc(doc(db, 'users', userData.uid), {
          xp: increment(earnedXp)
        });
      } catch (err) {
        console.error("Erro ao adicionar XP ao usuário", err);
      }
    } else {
      let hasEquippedShield = false;
      me.equippedItems?.forEach((item: any) => {
        if (item.gameEffect === 'extra_life') hasEquippedShield = true;
      });

      if (!hasEquippedShield && !hasShield) {
        if (economySettings?.coinsLostInCombat) {
          const rankObj = getRankForXp(userData?.xp || 0);
          const rankIndex = Math.max(1, RANKS.findIndex(r => r.name === rankObj.name));
          const maxLost = rankIndex * 1;
          const lost = Math.floor(Math.random() * maxLost) + 1;
          setLostCoinsDisplay(lost);
          try {
             const currentCoins = userData.coins || 0;
             await updateDoc(doc(db, 'users', userData.uid), { coins: Math.max(0, currentCoins - lost) });
          } catch(e){}
        }

        const currentHp = me.hp !== undefined ? me.hp : maxHearts;
        const newHp = Math.max(0, currentHp - 1);
        updates[\`players.\${userData.uid}.hp\`] = newHp;

        try {
          const userUpdate: any = { hearts: newHp };
          if (currentHp >= maxHearts && newHp < maxHearts) {
            userUpdate.hpRecoveryStartTimestamp = Date.now();
          }
          await supabase.from('users').update(userUpdate).eq('id', userData.uid);
        } catch(e) { console.error(e); }
      } else {
        if (hasShield) setHasShield(false);
        updates[\`players.\${userData.uid}.isProtected\`] = true;
      }
    }

    const { data: uC } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
    if (uC && uC.players && uC.players[userData.uid]) {
      uC.players[userData.uid].currentAnswer = idx;
      await supabase.from('live_quests').update({ players: uC.players }).eq('id', sessionId);
    }`;

const newHandleAnswerStr = `    const { data: qData } = await supabase.from('live_quests').select('players, monsterHp').eq('id', sessionId).single();
    if (qData && qData.players && qData.players[userData.uid]) {
      const p = qData.players[userData.uid];
      p.currentAnswer = answerIndex;
      p.isCorrect = isCorrect;
      p.answerTime = answerTime;
      p.score = newScore;
      p.xp = newXp;
      p.sessionEarnedXp = newSessionEarnedXp;
      
      let newMonsterHp = qData.monsterHp;
      
      if (isCorrect) {
        const power = 1;
        newMonsterHp = (newMonsterHp || 0) - power;
        
        if (economySettings?.coinsDropInCombat) {
          const dmg = 1;
          const rankObj = getRankForXp(userData?.xp || 0);
          const rankIndex = Math.max(1, RANKS.findIndex(r => r.name === rankObj.name));
          const maxCoins = rankIndex * dmg;
          const dropped = Math.floor(Math.random() * maxCoins) + 1;
          setCoinsToRescue(dropped);
        }

        try {
          const { data: u } = await supabase.from('users').select('xp').eq('id', userData.uid).single();
          if (u) await supabase.from('users').update({ xp: (u.xp || 0) + earnedXp }).eq('id', userData.uid);
        } catch (err) {
          console.error("Erro ao adicionar XP ao usuário", err);
        }
      } else {
        let hasEquippedShield = false;
        me.equippedItems?.forEach((item: any) => {
          if (item.gameEffect === 'extra_life') hasEquippedShield = true;
        });

        if (!hasEquippedShield && !hasShield) {
          const rankObj = getRankForXp(userData?.xp || 0);
          const rankIndex = Math.max(1, RANKS.findIndex(r => r.name === rankObj.name));
          
          if (economySettings?.coinsLostInCombat) {
            const maxLost = rankIndex * 1;
            const lost = Math.floor(Math.random() * maxLost) + 1;
            setLostCoinsDisplay(lost);
            try {
               const currentCoins = userData.coins || 0;
               await supabase.from('users').update({ coins: Math.max(0, currentCoins - lost) }).eq('id', userData.uid);
            } catch(e){}
          }

          const currentHp = me.hp !== undefined ? me.hp : maxHearts;
          const newHp = Math.max(0, currentHp - 1);
          p.hp = newHp;

          try {
            const userUpdate: any = { hearts: newHp };
            if (currentHp >= maxHearts && newHp < maxHearts) {
              userUpdate.hpRecoveryStartTimestamp = Date.now();
            }
            await supabase.from('users').update(userUpdate).eq('id', userData.uid);
          } catch(e) { console.error(e); }
        } else {
          if (hasShield) setHasShield(false);
          p.isProtected = true;
        }
      }

      await supabase.from('live_quests').update({ players: qData.players, monsterHp: newMonsterHp }).eq('id', sessionId);
    }`;

live = live.replace(oldHandleAnswerStr, newHandleAnswerStr);

// Also remove the unused totalDefense variable
live = live.replace(/const totalDefense = Math\.floor\(stats\.defense \/ 10\);\n/g, "");

fs.writeFileSync('src/pages/LiveQuestStudent.tsx', live, 'utf-8');
console.log('done');
