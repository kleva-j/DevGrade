import { createFileRoute } from "@tanstack/react-router";

import { AssessmentFlow } from "@/components/assessment/AssessmentFlow";

export const Route = createFileRoute("/")({ component: AssessmentFlow });
