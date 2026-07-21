import React, { useState, useEffect } from 'react';
import { X, Save, User as UserIcon } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { UserData } from '../contexts/AuthContext';
import AvatarCharacter, { type AvatarConfig } from './AvatarCharacter';
import { useDialog } from '../contexts/DialogContext';

interface AvatarCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData: UserData;
  onSave: (newConfig: AvatarConfig) => void;
}

const SKIN_COLORS = ['#ffcc99', '#f1c27d', '#e0ac69', '#8d5524', '#c68642', '#3d2c23'];
const HAIR_COLORS = ['#000000', '#4a3000', '#8a4000', '#e3a934', '#a13131', '#ffffff', '#a8a8a8', '#5b5b5b', '#ff00ff', '#00ffff'];
const EYE_COLORS = [
  '#000000', '#4a3000', '#3b5998', '#2ecc71', '#9b59b6', '#e74c3c'
];

const CLOTHES_COLORS = [
  '#e5e5e5', '#333333', '#d63074', '#3498db', '#2ecc71', '#f1c40f', '#e67e22', '#9b59b6'
];
const HAIR_STYLES = ['short', 'long', 'spiky', 'bald', 'ponytail', 'mohawk', 'messy'];
const MOUTH_STYLES = ['smile', 'neutral', 'sad', 'open', 'teeth'];
const EYE_STYLES = ['normal', 'cute', 'wink', 'tired'];

export default function AvatarCustomizationModal({ isOpen, onClose, userData, onSave }: AvatarCustomizationModalProps) {
  const { showAlert } = useDialog();
  const [config, setConfig] = useState<AvatarConfig>({
    gender: 'male',
    skinColor: '#ffcc99',
    hairColor: '#4a3000',
    eyeColor: '#000000',
    hairStyle: 'short',
    mouthStyle: 'smile',
    handedness: 'right',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfig(userData.avatarConfig || {
        gender: 'male',
        skinColor: '#ffcc99',
        hairColor: '#4a3000',
        eyeColor: '#000000',
        hairStyle: 'short',
        mouthStyle: 'smile',
        handedness: 'right',
        animationState: 'idle',
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', userData.uid), { avatarConfig: config });
      onSave(config);
      await showAlert('Personagem salvo com sucesso!');
      onClose();
    } catch (e) {
      console.error(e);
      await showAlert('Erro ao salvar personagem.');
    }
    setSaving(false);
  };

  const ColorPicker = ({ label, colors, value, onChange }: { label: string, colors: string[], value: string, onChange: (c: string) => void }) => (
    <div style={{ marginBottom: '1.5rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{label}</label>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {colors.map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            style={{
              width: '32px', height: '32px',
              borderRadius: '50%',
              backgroundColor: c,
              border: value === c ? '3px solid var(--accent-primary)' : '2px solid transparent',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
          />
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.5rem', borderRadius: '8px' }}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '28px', height: '28px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>RGB Livre</span>
        </div>
      </div>
    </div>
  );

  const StyleSelector = ({ label, options, value, onChange }: { label: string, options: string[], value: string, onChange: (s: string) => void }) => (
    <div style={{ marginBottom: '1.5rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{label}</label>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              backgroundColor: value === opt || (opt === options[0] && !value) ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: value === opt || (opt === options[0] && !value) ? '1px solid var(--accent-primary)' : '1px solid rgba(255, 255, 255, 0.1)',
              color: value === opt || (opt === options[0] && !value) ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div className="glass-panel" style={{
        width: '100%', maxWidth: '800px',
        maxHeight: '90vh',
        overflowY: 'auto',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '1.5rem', right: '1.5rem',
            background: 'none', border: 'none',
            color: 'var(--text-secondary)', cursor: 'pointer',
            padding: '0.5rem'
          }}
        >
          <X size={24} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <UserIcon size={32} color="var(--accent-primary)" />
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Personalizar Personagem</h2>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
          
          <div style={{
            flex: '1 1 250px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-dark)',
            borderRadius: '16px',
            padding: '2rem',
            minHeight: '300px',
            border: '2px solid var(--border-color)'
          }}>
            <AvatarCharacter config={config} size={150} animation={config.animationState || 'idle'} interactive={true} />
            
            <div style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Mão Dominante (Armas)</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={() => setConfig({ ...config, handedness: 'right' })}
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', background: config.handedness !== 'left' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', border: config.handedness !== 'left' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', color: config.handedness !== 'left' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Destro
                </button>
                <button
                  onClick={() => setConfig({ ...config, handedness: 'left' })}
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', background: config.handedness === 'left' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', border: config.handedness === 'left' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', color: config.handedness === 'left' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Canhoto
                </button>
              </div>
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setConfig({ ...config, animationState: 'idle' })} style={{ padding: '0.5rem 1rem', background: (!config.animationState || config.animationState === 'idle') ? 'var(--gold-primary)' : 'var(--bg-card)', color: (!config.animationState || config.animationState === 'idle') ? '#000' : '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', cursor: 'pointer' }}>Parado</button>
              <button onClick={() => setConfig({ ...config, animationState: 'walk' })} style={{ padding: '0.5rem 1rem', background: config.animationState === 'walk' ? 'var(--gold-primary)' : 'var(--bg-card)', color: config.animationState === 'walk' ? '#000' : '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', cursor: 'pointer' }}>Andando</button>
              <button onClick={() => setConfig({ ...config, animationState: 'run' })} style={{ padding: '0.5rem 1rem', background: config.animationState === 'run' ? 'var(--gold-primary)' : 'var(--bg-card)', color: config.animationState === 'run' ? '#000' : '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', cursor: 'pointer' }}>Correndo</button>
            </div>
            
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Pré-visualização (Pisca automaticamente)</p>
          </div>

          {/* Controls */}
          <div style={{ flex: '2 1 400px' }}>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Modelo Base (Gênero)</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['male', 'female'].map(gender => (
                  <button
                    key={gender}
                    onClick={() => setConfig({ ...config, gender: gender as any })}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      background: config.gender === gender || (gender === 'male' && !config.gender) ? 'var(--gold-primary)' : 'var(--bg-dark)',
                      color: config.gender === gender || (gender === 'male' && !config.gender) ? '#000' : '#fff',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      textTransform: 'capitalize'
                    }}
                  >
                    {gender === 'male' ? 'Masculino' : 'Feminino'}
                  </button>
                ))}
              </div>
            </div>

            <ColorPicker 
              label="Cor de Pele" 
              colors={SKIN_COLORS} 
              value={config.skinColor || ''} 
              onChange={c => setConfig({ ...config, skinColor: c })} 
            />
            
            <ColorPicker 
              label="Cor do Cabelo" 
              colors={HAIR_COLORS} 
              value={config.hairColor || ''} 
              onChange={c => setConfig({ ...config, hairColor: c })} 
            />
            
            <ColorPicker 
              label="Cor da Camisa/Vestido" 
              colors={CLOTHES_COLORS} 
              value={config.shirtColor || (config.gender === 'female' ? '#d63074' : '#e5e5e5')} 
              onChange={c => setConfig({ ...config, shirtColor: c })} 
            />

            <ColorPicker 
              label="Cor da Calça (Detalhes Vestido)" 
              colors={CLOTHES_COLORS} 
              value={config.pantsColor || (config.gender === 'female' ? '#d63074' : '#3a2d24')} 
              onChange={c => setConfig({ ...config, pantsColor: c })} 
            />

            <ColorPicker 
              label="Cor dos Olhos" 
              colors={EYE_COLORS} 
              value={config.eyeColor || ''} 
              onChange={c => setConfig({ ...config, eyeColor: c })} 
            />

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Estilo de Cabelo</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'short', label: 'Curto', genders: ['male'] },
                  { id: 'long', label: 'Longo', genders: ['female', 'male'] },
                  { id: 'spiky', label: 'Espetado', genders: ['male'] },
                  { id: 'ponytail', label: 'Rabo de Cavalo', genders: ['female'] },
                  { id: 'mohawk', label: 'Moicano', genders: ['male'] },
                  { id: 'bald', label: 'Careca', genders: ['male', 'female'] }
                ].filter(opt => opt.genders.includes(config.gender || 'male')).map(style => (
                  <button
                    key={style.id}
                    onClick={() => setConfig({ ...config, hairStyle: style.id })}
                    style={{
                      padding: '0.5rem 1rem',
                      background: config.hairStyle === style.id ? 'var(--gold-primary)' : 'var(--bg-dark)',
                      color: config.hairStyle === style.id ? '#000' : '#fff',
                      border: '1px solid var(--border-color)',
                      borderRadius: '20px',
                      cursor: 'pointer'
                    }}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Expressão</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'smile', label: 'Sorrindo :)' },
                  { id: 'neutral', label: 'Sério :|' },
                  { id: 'sad', label: 'Triste :(' },
                  { id: 'surprised', label: 'Surpreso :o' },
                  { id: 'teeth', label: 'Feliz :D' },
                  { id: 'tongue', label: 'Língua :P' }
                ].map(style => (
                  <button
                    key={style.id}
                    onClick={() => setConfig({ ...config, mouthStyle: style.id })}
                    style={{
                      padding: '0.5rem 1rem',
                      background: config.mouthStyle === style.id ? 'var(--gold-primary)' : 'var(--bg-dark)',
                      color: config.mouthStyle === style.id ? '#000' : '#fff',
                      border: '1px solid var(--border-color)',
                      borderRadius: '20px',
                      cursor: 'pointer'
                    }}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>


            <button 
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ width: '100%', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <Save size={20} />
              {saving ? 'Salvando...' : 'Salvar Personagem'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
