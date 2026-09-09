import React, { useEffect, useState } from 'react';
import {
  Database,
  Package,
  Volume2,
  //@ts-ignore
  Swords,
  HelpCircle,
  Medal,
  Box,
  MessageSquare,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';

// @ts-ignore
void HelpCircle;

interface AdminBanksHubProps {
  onNavigate: (target: { tab: string; generalSubTab?: string; openModal?: string }) => void;
}

export const AdminBanksHub: React.FC<AdminBanksHubProps> = ({ onNavigate }) => {
  const { tenantId } = useTenant();
  const [counts, setCounts] = useState<{
    items: number;
    audio: number;
    questions: number;
    ranks: number;
    entities: number;
    speeches: number;
    loading: boolean;
  }>({
    items: 0,
    audio: 0,
    questions: 0,
    ranks: 0,
    entities: 0,
    speeches: 0,
    loading: true,
  });

  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  useEffect(() => {
    loadCounts();
  }, [tenantId]);

  const loadCounts = async () => {
    try {
      // Itens do Banco Global de Itens
      const { count: itemsCount } = await supabase.from('item_bank').select('*', { count: 'exact', head: true });

      // Áudios
      let audioQ = supabase.from('audio_bank').select('*', { count: 'exact', head: true });
      if (tenantId) audioQ = audioQ.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      const { count: audioCount } = await audioQ;

      // Questões do Banco Global de Questões
      const { count: questionsCount } = await supabase.from('question_bank').select('*', { count: 'exact', head: true });

      // Entidades / Monstros / Skins
      let entitiesQ = supabase.from('preset_skins').select('*', { count: 'exact', head: true }).eq('type', 'monster');
      if (tenantId) entitiesQ = entitiesQ.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      const { count: entitiesCount } = await entitiesQ;

      // Patentes (ranks)
      let ranksQ = supabase.from('ranks').select('*', { count: 'exact', head: true });
      if (tenantId) ranksQ = ranksQ.eq('tenant_id', tenantId);
      const { count: ranksCount } = await ranksQ;

      setCounts({
        items: itemsCount ?? 0,
        audio: audioCount ?? 0,
        questions: questionsCount ?? 0,
        ranks: ranksCount ?? 0,
        entities: entitiesCount ?? 0,
        speeches: 34, // base de falas catalogadas
        loading: false,
      });
    } catch (err) {
      console.error('Erro ao carregar contadores dos bancos:', err);
      setCounts(prev => ({ ...prev, loading: false }));
    }
  };

  const bankCards = [
    {
      id: 'items',
      title: 'Banco de Itens',
      subtitle: 'Equipamentos & Consumíveis',
      description: 'Acervo global de espadas, escudos, armaduras, poções, pergaminhos e cosméticos centralizados.',
      icon: <Package size={24} color="#fbbf24" />,
      accentColor: '#fbbf24',
      badge: `${counts.items} itens globais`,
      actionText: 'Abrir Banco de Itens',
      onClick: () => onNavigate({ tab: 'general', openModal: 'item_bank' }),
    },
    {
      id: 'questions',
      title: 'Banco de Questões',
      subtitle: 'Perguntas & Desafios Globais',
      description: 'Acervo centralizado de perguntas matemáticas, alternativas, mídias e gabaritos para missões.',
      icon: <HelpCircle size={24} color="#ef4444" />,
      accentColor: '#ef4444',
      badge: `${counts.questions} questões`,
      actionText: 'Abrir Banco de Questões',
      onClick: () => onNavigate({ tab: 'general', openModal: 'question_bank' }),
    },
    {
      id: 'audio',
      title: 'Banco de Áudio & Forja',
      subtitle: 'Efeitos Sonoros & Trilhas',
      description: 'Efeitos sonoros de impacto, magias, golpes, falas por gênero, músicas e sons da bigorna e transmutação.',
      icon: <Volume2 size={24} color="#f97316" />,
      accentColor: '#f97316',
      badge: `${counts.audio} áudios`,
      actionText: 'Abrir Banco de Sons',
      onClick: () => onNavigate({ tab: 'general', openModal: 'audio_bank' }),
    },
    {
      id: 'monsters',
      title: 'Banco de Monstros & 3D',
      subtitle: 'Criaturas & Modelos GLB',
      description: 'Galeria de criaturas 3D, skins temáticas, golpes especiais, animações procedurais e configurações de drops.',
      icon: <Box size={24} color="#c084fc" />,
      accentColor: '#c084fc',
      badge: `${counts.entities} criaturas`,
      actionText: 'Galeria de Monstros',
      onClick: () => onNavigate({ tab: 'entities' }),
    },
    {
      id: 'speeches',
      title: 'Banco de Falas',
      subtitle: 'Diálogos & Combate',
      description: 'Centralização de todas as falas do jogo: dicas introdutórias do companheiro e frases dinâmicas de combate por HP.',
      icon: <MessageSquare size={24} color="#10b981" />,
      accentColor: '#10b981',
      badge: `Falas Ativas`,
      actionText: 'Configurar Falas',
      onClick: () => onNavigate({ tab: 'general', generalSubTab: 'speeches' }),
    },
    {
      id: 'ranks',
      title: 'Banco de Patentes',
      subtitle: 'Progressão & Níveis',
      description: 'Configuração dos níveis de patente, limites de atributos por patente e requisitos de XP para progressão.',
      icon: <Medal size={24} color="#3b82f6" />,
      accentColor: '#3b82f6',
      badge: `${counts.ranks} patentes`,
      actionText: 'Configurar Patentes',
      onClick: () => onNavigate({ tab: 'general', generalSubTab: 'ranks' }),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', paddingTop: '0.5rem' }}>
      {/* Banner de Topo com Glassmorphism */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.9) 100%)',
        border: '1px solid var(--border-glass)',
        borderRadius: '16px',
        padding: '1.5rem 2rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.25rem 0.75rem',
            borderRadius: '999px',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: 'var(--gold-primary)',
            fontSize: '0.75rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            <Sparkles size={13} />
            Central Unificada de Recursos
          </div>

          <h2 style={{
            margin: 0,
            fontSize: '1.6rem',
            fontWeight: 800,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            letterSpacing: '-0.02em',
          }}>
            <Database size={26} color="var(--gold-primary)" />
            Hub de Bancos do Sistema
          </h2>

          <p style={{
            margin: '0.35rem 0 0 0',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            maxWidth: '650px',
            lineHeight: 1.5,
          }}>
            Acesse e gerencie todos os repositórios centrais do Math Mastery em um único lugar. Escolha um banco abaixo para visualizar, configurar ou alimentar dados.
          </p>
        </div>
      </div>

      {/* Grid de Cards dos Bancos */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '1.25rem',
      }}>
        {bankCards.map(card => {
          const isHovered = hoveredCard === card.id;
          return (
            <div
              key={card.id}
              onClick={card.onClick}
              onMouseEnter={() => setHoveredCard(card.id)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                position: 'relative',
                background: isHovered
                  ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)'
                  : 'linear-gradient(135deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.75) 100%)',
                border: isHovered
                  ? `1px solid ${card.accentColor}`
                  : '1px solid var(--border-glass)',
                borderRadius: '16px',
                padding: '1.35rem',
                boxShadow: isHovered
                  ? `0 12px 30px rgba(0, 0, 0, 0.5), 0 0 20px ${card.accentColor}25`
                  : '0 6px 20px rgba(0, 0, 0, 0.25)',
                transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '210px',
                overflow: 'hidden',
              }}
            >
              {/* Glow sutil no topo do card */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '2px',
                background: `linear-gradient(90deg, transparent, ${card.accentColor}, transparent)`,
                opacity: isHovered ? 1 : 0.4,
                transition: 'opacity 0.25s',
              }} />

              <div>
                {/* Header do Card */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: `${card.accentColor}18`,
                    border: `1px solid ${card.accentColor}35`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 4px 12px ${card.accentColor}20`,
                  }}>
                    {card.icon}
                  </div>

                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.25rem 0.65rem',
                    borderRadius: '999px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)',
                  }}>
                    {counts.loading ? '...' : card.badge}
                  </span>
                </div>

                {/* Título e Subtítulo */}
                <h3 style={{
                  margin: '0 0 0.25rem 0',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  color: isHovered ? card.accentColor : 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  letterSpacing: '-0.01em',
                  transition: 'color 0.2s',
                }}>
                  {card.title}
                </h3>

                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: card.accentColor,
                  marginBottom: '0.6rem',
                  opacity: 0.9,
                }}>
                  {card.subtitle}
                </div>

                <p style={{
                  margin: 0,
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.45,
                }}>
                  {card.description}
                </p>
              </div>

              {/* Ação Inferior */}
              <div style={{
                marginTop: '1.25rem',
                paddingTop: '0.85rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: isHovered ? card.accentColor : 'var(--text-primary)',
                transition: 'color 0.2s',
              }}>
                <span>{card.actionText}</span>
                <ArrowRight
                  size={16}
                  style={{
                    transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminBanksHub;
