-- Signalement du salon d'une séance live (décision 7, arbitrage 42)
--
-- Le fil du salon ne disparaît pas à la fin de la séance : il reste attaché au
-- replay. Ce qui s'y dit d'inacceptable reste donc lisible longtemps après,
-- raison de plus pour lui donner une issue.
ALTER TYPE "ReportTargetType" ADD VALUE 'LIVE_MESSAGE' BEFORE 'DISPUTE_MESSAGE';
