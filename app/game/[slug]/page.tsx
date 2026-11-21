import { notFound } from 'next/navigation';
import Game1_Rebirth from '@/components/Game1_Rebirth';
import Game2_Boss from '@/components/Game2_Boss';
import Game3_MilkTea from '@/components/Game3_MilkTea';
import Game4_Duck from '@/components/Game4_Duck';
import Game5_Werewolf from '@/components/Game5_Werewolf';
import WeeklySummary from '@/components/WeeklySummary';

const VIEWS: Record<string, () => JSX.Element> = {
  rebirth: Game1_Rebirth,
  boss: Game2_Boss,
  milktea: Game3_MilkTea,
  duck: Game4_Duck,
  werewolf: Game5_Werewolf,
  weekly: WeeklySummary,
};

export default function GamePage({ params }: { params: { slug: string } }) {
  const View = VIEWS[params.slug];
  if (!View) notFound();
  return <View />;
}
