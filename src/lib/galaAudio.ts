// Motor de trilha sonora cerimonial da Apresentação de Gala (MP3 local/URL com crossfade)

class GalaSoundEngine {
  private muted = false;
  private musicAudio1: HTMLAudioElement | null = null;
  private musicAudio2: HTMLAudioElement | null = null;
  private activeMoment: 1 | 2 | null = null;
  private musicVolume = 0.5;
  private musicPlaying = false;

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.musicAudio1) this.musicAudio1.muted = muted;
    if (this.musicAudio2) this.musicAudio2.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMusicVolume(vol: number) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (this.musicAudio1 && this.activeMoment === 1) this.musicAudio1.volume = this.musicVolume;
    if (this.musicAudio2 && this.activeMoment === 2) this.musicAudio2.volume = this.musicVolume;
  }

  public configureMusicTracks(moment1Url?: string | null, moment2Url?: string | null) {
    this.stopMusic();
    if (moment1Url) {
      this.musicAudio1 = new Audio(moment1Url);
      this.musicAudio1.loop = true;
      this.musicAudio1.volume = this.musicVolume;
      this.musicAudio1.muted = this.muted;
    } else {
      this.musicAudio1 = null;
    }

    if (moment2Url) {
      this.musicAudio2 = new Audio(moment2Url);
      this.musicAudio2.loop = true;
      this.musicAudio2.volume = this.musicVolume;
      this.musicAudio2.muted = this.muted;
    } else {
      this.musicAudio2 = null;
    }
  }

  public playMomentMusic(moment: 1 | 2) {
    if (this.activeMoment === moment && this.musicPlaying) return;
    this.activeMoment = moment;
    const target = moment === 1 ? this.musicAudio1 : this.musicAudio2;
    const other = moment === 1 ? this.musicAudio2 : this.musicAudio1;

    if (other && !other.paused) {
      this.fadeOutAndPause(other);
    }

    if (target) {
      target.muted = this.muted;
      target.volume = 0;
      target.play()
        .then(() => {
          this.musicPlaying = true;
          this.fadeIn(target, this.musicVolume);
        })
        .catch(() => {
          this.musicPlaying = false;
        });
    } else {
      this.musicPlaying = false;
    }
  }

  public toggleMusic(): boolean {
    const target = this.activeMoment === 2 ? this.musicAudio2 : this.musicAudio1;
    if (!target) return false;
    if (target.paused) {
      target.volume = this.musicVolume;
      target.play().catch(() => {});
      this.musicPlaying = true;
      return true;
    } else {
      target.pause();
      this.musicPlaying = false;
      return false;
    }
  }

  public isMusicPlaying(): boolean {
    return this.musicPlaying;
  }

  public stopMusic() {
    this.musicPlaying = false;
    this.activeMoment = null;
    if (this.musicAudio1) {
      this.musicAudio1.pause();
      this.musicAudio1.currentTime = 0;
    }
    if (this.musicAudio2) {
      this.musicAudio2.pause();
      this.musicAudio2.currentTime = 0;
    }
  }

  private fadeIn(audio: HTMLAudioElement, targetVol: number) {
    let step = 0;
    const steps = 18;
    const timer = window.setInterval(() => {
      step++;
      audio.volume = Math.min(targetVol, (step / steps) * targetVol);
      if (step >= steps) window.clearInterval(timer);
    }, 65);
  }

  private fadeOutAndPause(audio: HTMLAudioElement) {
    const startVol = audio.volume;
    let step = 0;
    const steps = 14;
    const timer = window.setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVol * (1 - step / steps));
      if (step >= steps) {
        window.clearInterval(timer);
        audio.pause();
      }
    }, 55);
  }
}

export const galaAudio = new GalaSoundEngine();
