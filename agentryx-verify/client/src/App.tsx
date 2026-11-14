import { Route, Switch } from "wouter";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { ProjectView } from "./pages/ProjectView";
import { FeedbackInbox } from "./pages/FeedbackInbox";
import { Roadmap } from "./pages/Roadmap";
import { ProductManagement } from "./pages/ProductManagement";
import { Workspace } from "./pages/Workspace";
import { Cases } from "./pages/Cases";
import { CaseDetail } from "./pages/CaseDetail";
import { Automation } from "./pages/Automation";
import { Resources } from "./pages/Resources";
import { Questions } from "./pages/Questions";
import { Settings } from "./pages/Settings";
import { TeamQuestions } from "./pages/TeamQuestions";
import { Findings } from "./pages/Findings";

export function App() {
  return (
    <Switch>
      <Route path="/" component={Workspace} />
      <Route path="/cases/:id" component={CaseDetail} />
      <Route path="/cases" component={Cases} />
      <Route path="/automation" component={Automation} />
      <Route path="/resources" component={Resources} />
      <Route path="/questions" component={Questions} />
      <Route path="/settings" component={Settings} />
      <Route path="/team-questions" component={TeamQuestions} />
      <Route path="/findings/:id" component={Findings} />
      <Route path="/findings" component={Findings} />
      <Route path="/login" component={Login} />
      <Route path="/projects" component={Home} />
      <Route path="/admin/roadmap" component={Roadmap} />
      <Route path="/product" component={ProductManagement} />
      <Route path="/p/:slug/feedback" component={FeedbackInbox} />
      <Route path="/p/:slug" component={ProjectView} />
      <Route>404</Route>
    </Switch>
  );
}
