import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import App from "./App";

describe("Stock Dashboard Test Suite", () => {

  // ===================================================
  // BASIC RENDER / SMOKE TESTS
  // ===================================================

  // Verify dashboard title renders
  it("renders dashboard title", () => {
    render(<App />);

    expect(
      screen.getByText(/Stock Trends Analysis Dashboard/i)
    ).toBeInTheDocument();
  });


  // Verify Analyze button exists
  it("shows analyze button", () => {
    render(<App />);

    const buttons = screen.getAllByRole("button");

    const analyzeButton = buttons.find(
      b => b.textContent === "Analyze"
    );

    expect(analyzeButton).toBeInTheDocument();
  });


  // Verify default ticker is NVDA
  it("default ticker is NVDA", () => {
    render(<App />);

    const inputs =
      screen.getAllByDisplayValue("NVDA");

    expect(
      inputs.length
    ).toBeGreaterThan(0);
  });



  // ===================================================
  // UI INTERACTION TESTS
  // ===================================================

  // Verify Guide tab navigation works
  it("switches to guide tab", () => {
    render(<App />);

    const buttons =
      screen.getAllByRole("button");

    const guideButton =
      buttons.find(
        b => b.textContent === "Guide"
      );

    fireEvent.click(guideButton);

    expect(
      screen.getByText(
        /Welcome to the Stock Trends Analysis Dashboard/i
      )
    ).toBeInTheDocument();
  });


  // Verify indicator checkbox toggles
  it("toggles indicator checkbox", () => {
    render(<App />);

    const boxes =
      screen.getAllByRole("checkbox");

    expect(
      boxes[0]
    ).not.toBeChecked();

    fireEvent.click(
      boxes[0]
    );

    expect(
      boxes[0]
    ).toBeChecked();
  });


  // Verify chart type switch works
  it("switches chart type", () => {
    render(<App />);

    const lineButton =
      screen
        .getAllByRole("button")
        .find(
          b => b.textContent === "Line"
        );

    fireEvent.click(
      lineButton
    );

    expect(
      lineButton
    ).toHaveTextContent("Line");
  });


  // Verify period selector changes
  it("changes period selector", () => {
    render(<App />);

    const selects =
      screen.getAllByRole("combobox");

    fireEvent.change(
      selects[0],
      {
        target: {
          value: "1mo"
        }
      }
    );

    expect(
      selects[0].value
    ).toBe("1mo");
  });



  // ===================================================
  // USER WORKFLOW TESTS
  // ===================================================

  // Verify adding comparison ticker
  it("adds compare ticker", () => {
    render(<App />);

    const inputs =
      screen.getAllByRole("textbox");

    const compareInput =
      inputs[1];

    fireEvent.change(
      compareInput,
      {
        target: {
          value: "AAPL"
        }
      }
    );

    const buttons =
      screen.getAllByRole("button");

    const addButton =
      buttons.find(
        b => b.textContent === "Add"
      );

    fireEvent.click(
      addButton
    );

    expect(
      screen.getByText("AAPL")
    ).toBeInTheDocument();
  });


  // Verify removing comparison ticker
  it("removes compare ticker", () => {
    render(<App />);

    const inputs =
      screen.getAllByRole("textbox");

    const compareInput =
      inputs[1];

    fireEvent.change(
      compareInput,
      {
        target: {
          value: "AAPL"
        }
      }
    );

    const buttons =
      screen.getAllByRole("button");

    const addButton =
      buttons.find(
        b => b.textContent === "Add"
      );

    fireEvent.click(
      addButton
    );

    expect(
      screen.getByText("AAPL")
    ).toBeInTheDocument();

    const removeButtons =
      screen.getAllByText("×");

    fireEvent.click(
      removeButtons[0]
    );

    expect(
      screen.queryByText("AAPL")
    ).not.toBeInTheDocument();
  });



  // ===================================================
  // ADVANCED API TESTS
  // ===================================================

  // Verify OHLCV endpoint returns stock data
  it("fetches stock data from ohlcv endpoint", async () => {

    const mockData = {
      data: [
        {
          Date: "2024-01-01",
          Close: 150,
          Volume: 10000
        }
      ],
      indicators: {},
      metrics: {}
    };

    global.fetch =
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData
      });

    const res = await fetch(
      "https://stock-trends-dashboard.onrender.com/ohlcv"
    );

    const json = await res.json();

    expect(fetch)
      .toHaveBeenCalledTimes(1);

    expect(
      json.data[0].Close
    ).toBe(150);

  });



  // Verify comparison endpoint
  it("fetches comparison data", async () => {

    const mockCompare = {
      tickers: ["AAPL","MSFT"],
      dates: ["2024-01-01"],
      series: {
        AAPL:[100],
        MSFT:[102]
      }
    };

    global.fetch =
      vi.fn().mockResolvedValue({
        ok:true,
        json: async()=>mockCompare
      });

    const res = await fetch(
      "https://stock-trends-dashboard.onrender.com/compare"
    );

    const json = await res.json();

    expect(
      json.tickers.length
    ).toBe(2);

    expect(
      json.series.AAPL[0]
    ).toBe(100);

  });



  // Verify backtest endpoint metrics
  it("fetches backtest results", async () => {

    const mockBacktest = {
      portfolio_value: [10000,10800],
      benchmark_value: [10000,10400],
      summary:{
        strategy_return:8,
        max_drawdown:3
      }
    };

    global.fetch =
      vi.fn().mockResolvedValue({
        ok:true,
        json: async()=>mockBacktest
      });

    const res = await fetch(
      "https://stock-trends-dashboard.onrender.com/backtest"
    );

    const json = await res.json();

    expect(
      json.summary.strategy_return
    ).toBe(8);

    expect(
      json.portfolio_value.length
    ).toBe(2);

  });



  // Verify ML prediction endpoint
  it("fetches machine learning signal", async () => {

    const mockML = {
      signal:"BUY",
      confidence:91,
      metrics:{
        accuracy:0.84
      }
    };

    global.fetch =
      vi.fn().mockResolvedValue({
        ok:true,
        json: async()=>mockML
      });

    const res = await fetch(
      "https://stock-trends-dashboard.onrender.com/predict"
    );

    const json = await res.json();

    expect(
      json.signal
    ).toBe("BUY");

    expect(
      json.confidence
    ).toBe(91);

  });

});