// Native port of checkFluentEdit (app/src/refinement-policy.js) for the planned .NET host.
// C# 5 so the system csc (.NET Framework 4) builds it. Behaviour must match the JS
// checker on the shared fixtures in the local maintenance workspace.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

public sealed class CleanupRejected : Exception {
  public readonly string Reason;
  public CleanupRejected(string reason) : base("整理结果超出整理边界，原文仍保留。") { Reason = reason; }
}

public static class CleanupPolicy {
  static readonly string[][] Quotes = { new[] {"“","”"}, new[] {"‘","’"}, new[] {"「","」"}, new[] {"『","』"}, new[] {"«","»"}, new[] {"‹","›"}, new[] {"\"","\""}, new[] {"'","'"} };
  static readonly Regex Preface = new Regex(@"^(?:#{1,6}\s+|`{3,}|(?:整理后(?:的)?(?:文本|内容|正文)|以下(?:是|为)|总结|要点|主题)\s*[:：]?|好的[，,！!])");
  static readonly Regex Ignored = new Regex(@"[\p{P}\p{Z}\s]");
  // JS uses \p{Script=Latin}; .NET has no script classes, so the common Latin blocks are listed.
  const string Latin = @"A-Za-zªºÀ-ÖØ-öø-ɏḀ-ỿＡ-Ｚａ-ｚ\p{M}";
  static readonly Regex LatinToken = new Regex("[" + Latin + "]+(?:['’ʼ\\p{Pd}][" + Latin + "]+)*");
  static readonly Regex ListMarker = new Regex(@"^[\p{Z}\t]*(?:[0-9０-９]{1,2}[.、．)）](?![0-9０-９])|[-*•·](?=[\p{Z}\t]))[\p{Z}\t]*");
  static readonly Regex Correction = new Regex(@"(^|[，,。、；;！!？?\p{Z}\s])(?:哦|啊|呃|嗯)?(?:不对|不是|不不|说错了|错了)+(?=[，,。、；;！!？?\p{Z}\s]|$)");
  static readonly Regex NumberRun = new Regex("[0-9]+|[零〇一二两三四五六七八九十百千万亿]+");
  static readonly Regex RepeatedNegation = new Regex("([不没未])\\1+");
  // ECMAScript mode keeps \b ASCII-based, as in the JS checker, so "not合并" still counts.
  static readonly Regex LatinNegation = new Regex(@"\b(?:not|never|without)\b|n['’]t\b", RegexOptions.ECMAScript | RegexOptions.IgnoreCase);

  static string Content(string text) { return Ignored.Replace(text, ""); }
  static List<string> CodePoints(string text) {
    var list = new List<string>();
    for (int i = 0; i < text.Length; i++) {
      if (char.IsHighSurrogate(text[i]) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1])) { list.Add(text.Substring(i, 2)); i++; }
      else list.Add(text[i].ToString());
    }
    return list;
  }
  static string Unlisted(string text) {
    return string.Join("\n", Regex.Split(text, "\r?\n").Select(line => ListMarker.Replace(line, "", 1)));
  }
  static List<string> NumberRuns(string text) {
    var ascii = new StringBuilder(text.Length);
    foreach (char ch in text) ascii.Append(ch >= '０' && ch <= '９' ? (char)(ch - 0xFEE0) : ch);
    return NumberRun.Matches(ascii.ToString()).Cast<Match>().Select(m => m.Value).ToList();
  }
  static List<string> LatinTokens(string text) {
    return LatinToken.Matches(text).Cast<Match>().Select(m => m.Value.ToLowerInvariant()).ToList();
  }
  static bool IsSubsequence(List<string> part, List<string> whole) {
    int i = 0;
    foreach (var item in whole) if (i < part.Count && part[i] == item) i++;
    return i == part.Count;
  }
  static int Excess(List<string> part, List<string> whole) {
    var pool = new Dictionary<string, int>();
    foreach (var item in whole) { int n; pool.TryGetValue(item, out n); pool[item] = n + 1; }
    int extra = 0;
    foreach (var item in part) { int left; if (pool.TryGetValue(item, out left) && left > 0) pool[item] = left - 1; else extra++; }
    return extra;
  }
  static HashSet<string> Negations(string text) {
    var chars = CodePoints(RepeatedNegation.Replace(Content(text), "$1"));
    var pairs = new HashSet<string>();
    for (int i = 0; i < chars.Count; i++) if (chars[i] == "不" || chars[i] == "没" || chars[i] == "未") pairs.Add(chars[i] + (i + 1 < chars.Count ? chars[i + 1] : ""));
    return pairs;
  }

  public static string CheckFluentEdit(string original, string value) {
    if (original == null || value == null || original.Trim().Length == 0 || value.Trim().Length == 0 || original.Contains("\0") || value.Contains("\0")) throw new CleanupRejected("empty");
    string before = original.Trim(), after = value.Trim();
    if (before == after) return after;
    var preface = Preface.Match(after);
    if (preface.Success && !before.StartsWith(preface.Value, StringComparison.Ordinal)) throw new CleanupRejected("preface");
    foreach (var q in Quotes)
      if (after.StartsWith(q[0], StringComparison.Ordinal) && after.EndsWith(q[1], StringComparison.Ordinal) && !(before.StartsWith(q[0], StringComparison.Ordinal) && before.EndsWith(q[1], StringComparison.Ordinal))) throw new CleanupRejected("wrapper");

    string source = Unlisted(before), output = Unlisted(after);
    if (!IsSubsequence(NumberRuns(output), NumberRuns(source))) throw new CleanupRejected("numbers");
    if (Excess(LatinTokens(output), LatinTokens(source)) > 0) throw new CleanupRejected("terms");
    var inChars = CodePoints(Content(source).ToLowerInvariant());
    var outChars = CodePoints(Content(output).ToLowerInvariant());
    if (outChars.Count > inChars.Count * 1.05 + 2) throw new CleanupRejected("expanded");
    if (inChars.Count >= 30 && outChars.Count < inChars.Count * .35) throw new CleanupRejected("truncated");
    if (Excess(outChars, inChars) > Math.Max(2, (int)Math.Ceiling(outChars.Count * .08))) throw new CleanupRejected("content");
    var kept = Negations(output);
    foreach (var pair in Negations(Correction.Replace(source, "$1"))) if (!kept.Contains(pair)) throw new CleanupRejected("negation");
    if (LatinNegation.Matches(output).Count < LatinNegation.Matches(source).Count) throw new CleanupRejected("negation");
    return after;
  }
}
