import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, ActivityIndicator } from 'react-native';
import { useAudio } from '../hooks/useAudio';

interface AudioButtonProps {
  wordId: number;
  text: string;
  autoPlay?: boolean;
  voice?: string;   // Voice for audio (e.g., "banmai", "leminh")
  speed?: number;   // Speed for audio (-3 to +3)
}

export function AudioButton({ wordId, text, autoPlay = false, voice, speed }: AudioButtonProps) {
  const { play, isPlaying, isLoading } = useAudio(wordId, text, { autoPlay, voice, speed });

  return (
    <TouchableOpacity
      onPress={play}
      disabled={isPlaying || isLoading}
      style={[
        styles.button,
        (isPlaying || isLoading) && styles.buttonDisabled,
      ]}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" style={styles.icon} />
        ) : (
          <Text style={styles.icon}>{isPlaying ? '🔊' : '🔈'}</Text>
        )}
        <Text style={styles.text}>Play Word</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#818CF8',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  icon: {
    fontSize: 28,
  },
  text: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
