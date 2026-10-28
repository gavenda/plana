/**
 * The parts of Chart.js the dashboard uses, registered once. Named imports let the bundler
 * drop the rest; `loadChart` in charts.ts loads this file on demand.
 */
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix'

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  MatrixController,
  MatrixElement,
)

export { Chart }
