import type {
  ProjectDecision,
  ProjectRisk,
} from "@/types/action-center";

export interface PortfolioRisk extends ProjectRisk {
  project_name: string;
}

export interface PortfolioDecision extends ProjectDecision {
  project_name: string;
}

export interface PortfolioActionCenterData {
  risks: PortfolioRisk[];
  decisions: PortfolioDecision[];
}
