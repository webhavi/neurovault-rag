"""One-shot import verification for the sandbox's package versions."""
import warnings

warnings.filterwarnings("ignore")

ok, fail = [], []


def check(name, fn):
    try:
        fn()
        ok.append(name)
    except Exception as e:  # noqa: BLE001
        fail.append(f"{name}: {type(e).__name__}: {str(e)[:140]}")


def imp_lc_prompts():
    from langchain_core.prompts import ChatPromptTemplate  # noqa: F401


def imp_text_splitters():
    from langchain_text_splitters import RecursiveCharacterTextSplitter  # noqa: F401


def imp_pypdf_loader():
    from langchain_community.document_loaders import PyPDFLoader  # noqa: F401


def imp_text_loader():
    from langchain_community.document_loaders import TextLoader  # noqa: F401


def imp_chroma_vs():
    from langchain_community.vectorstores import Chroma  # noqa: F401


def imp_onnx():
    from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2  # noqa: F401


def imp_groq():
    from langchain_groq import ChatGroq  # noqa: F401


check("fastapi", lambda: __import__("fastapi"))
check("pydantic_settings", lambda: __import__("pydantic_settings"))
check("chromadb", lambda: __import__("chromadb"))
check("langchain_core.prompts", imp_lc_prompts)
check("langchain_text_splitters", imp_text_splitters)
check("langchain_community.PyPDFLoader", imp_pypdf_loader)
check("langchain_community.TextLoader", imp_text_loader)
check("langchain_community.vectorstores.Chroma", imp_chroma_vs)
check("chromadb ONNXMiniLM_L6_V2", imp_onnx)
check("langchain_groq", imp_groq)

print("OK:")
print(*[f"  {n}" for n in ok], sep="\n")
if fail:
    print("FAIL:")
    print(*[f"  {n}" for n in fail], sep="\n")
else:
    print("no failures")
